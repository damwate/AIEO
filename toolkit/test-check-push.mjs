// toolkit/test-check-push.mjs —— check-push.mjs 发现/验证逻辑单元测试
// 运行：node toolkit/test-check-push.mjs（node:test，直接运行即执行并按结果置退出码）
// 覆盖（2026-11-14 代理共识五条 + 复核 R1 dispatch-16-05-36 整改项）：
//   分协议解析 / 三态注册表发现（查询失败≠无代理）/ netstat 发现失败记录 / 端口合法性统一校验 /
//   非本机地址跳过（P2-1）/ 候选队列去重与发现序 / 超时分离与继续候选 / TCP 预筛跳过 dry-run
// 全部用注入 runner，不依赖真实注册表、真实代理端口与真实 Git 网络连接（P1-2）。
import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import {
  parseProxyServerString,
  discoverRegistryProxy,
  discoverNetstatPorts,
  parseNetstatListeners,
  buildCandidateQueue,
  portsFromGitConfigEntries,
  isValidPort,
  probePort,
  runProbeSequence,
  probeCandidate,
} from "./check-push.mjs";

// ---------- isValidPort（P1-3 统一校验） ----------
test("isValidPort：0/65536/1.5/-1/Infinity/NaN 拒绝，1/65535/3572 通过", () => {
  assert.equal(isValidPort(0), false);
  assert.equal(isValidPort(65536), false);
  assert.equal(isValidPort(1.5), false);
  assert.equal(isValidPort(-1), false);
  assert.equal(isValidPort(Infinity), false);
  assert.equal(isValidPort(NaN), false);
  assert.equal(isValidPort("1"), true);
  assert.equal(isValidPort(65535), true);
  assert.equal(isValidPort(3572), true);
});

// ---------- parseProxyServerString（共识 1：按协议解析） ----------
test("分协议串：SakuraCat 格式，三协议同端口合并，preferred=3572", () => {
  const r = parseProxyServerString("http=127.0.0.1:3572;https=127.0.0.1:3572;socks=127.0.0.1:3572");
  assert.equal(r.ok, true);
  assert.equal(r.format, "per-protocol");
  assert.deepEqual(r.ports, { http: 3572, https: 3572, socks: 3572 });
  assert.equal(r.preferred, 3572);
});

test("分协议串：各协议端口不同时，https 优先（preferred=2222）", () => {
  const r = parseProxyServerString("http=127.0.0.1:1111;https=127.0.0.1:2222;socks=127.0.0.1:3333");
  assert.equal(r.ok, true);
  assert.equal(r.preferred, 2222);
  assert.deepEqual(r.ports, { http: 1111, https: 2222, socks: 3333 });
});

test("传统串：本机 host:port", () => {
  const r = parseProxyServerString("127.0.0.1:8080");
  assert.equal(r.ok, true);
  assert.equal(r.format, "legacy");
  assert.equal(r.preferred, 8080);
});

test("传统串：非本机地址 → parse_failed + nonLocal 记录原因（P2-1，不静默丢主机）", () => {
  const r = parseProxyServerString("proxy.corp:3128");
  assert.equal(r.ok, false);
  assert.equal(r.reason, "parse_failed");
  assert.equal(r.nonLocal[0].reason, "非本机地址");
  assert.equal(r.nonLocal[0].addr, "proxy.corp:3128");
});

test("分协议串：混入非法端口 70000 → 该协议被剔除并记录，合法协议保留", () => {
  const r = parseProxyServerString("http=127.0.0.1:70000;https=127.0.0.1:3572");
  assert.equal(r.ok, true);
  assert.deepEqual(r.ports, { https: 3572 });
  assert.equal(r.nonLocal[0].reason, "非法端口 70000");
});

test("空值 → reason=empty；垃圾值 → parse_failed", () => {
  assert.equal(parseProxyServerString("").reason, "empty");
  assert.equal(parseProxyServerString(null).reason, "empty");
  assert.equal(parseProxyServerString("nonsense").reason, "parse_failed");
});

// ---------- discoverRegistryProxy（共识 5：三态，查询失败≠无代理） ----------
test("注册表查询失败（runner 抛错，实际注册表有值）→ query_failed，禁止当'无代理'", async () => {
  const r = await discoverRegistryProxy({
    runner: async () => { throw new Error("powershell 不可用"); },
  });
  assert.equal(r.state, "query_failed");
  assert.deepEqual(r.ports, []);
  assert.notEqual(r.state, "no_value");
});

test("注册表查询失败（非零退出码）→ query_failed 且带 stderr 详情", async () => {
  const r = await discoverRegistryProxy({
    runner: async () => ({ ok: false, code: 1, stdout: "", stderr: "ACCESS DENIED" }),
  });
  assert.equal(r.state, "query_failed");
  assert.match(r.detail, /ACCESS DENIED/);
});

test("注册表正常：ProxyEnable=1 + 分协议串 → ok，同端口合并为单候选带来源标签", async () => {
  const r = await discoverRegistryProxy({
    runner: async () => ({
      ok: true, code: 0,
      stdout: "ENABLE=1\nSERVER=http=127.0.0.1:3572;https=127.0.0.1:3572;socks=127.0.0.1:3572\n",
      stderr: "",
    }),
  });
  assert.equal(r.state, "ok");
  assert.equal(r.preferred, 3572);
  assert.equal(r.ports.length, 1);
  assert.equal(r.ports[0].port, 3572);
  assert.match(r.ports[0].source, /注册表ProxyServer\(http\+https\+socks\)/);
});

test("多协议不同端口：https 优先排首位（复核场景 10）", async () => {
  const r = await discoverRegistryProxy({
    runner: async () => ({
      ok: true, code: 0,
      stdout: "ENABLE=1\nSERVER=http=127.0.0.1:1111;https=127.0.0.1:2222;socks=127.0.0.1:3333\n",
      stderr: "",
    }),
  });
  assert.equal(r.state, "ok");
  assert.deepEqual(r.ports.map((p) => p.port), [2222, 1111, 3333]);
});

test("注册表 SERVER 含非本机地址 → 仅本机地址成为候选，非本机记录跳过原因（P2-1）", async () => {
  const r = await discoverRegistryProxy({
    runner: async () => ({
      ok: true, code: 0,
      stdout: "ENABLE=1\nSERVER=http=127.0.0.1:1111;https=10.0.0.1:8080\n",
      stderr: "",
    }),
  });
  assert.equal(r.state, "ok");
  assert.deepEqual(r.ports.map((p) => p.port), [1111]);
  assert.ok(r.skipped.some((s) => s.includes("10.0.0.1") && s.includes("非本机地址")));
});

test("ProxyEnable=0 → disabled；SERVER 空 → no_value；输出异常/垃圾 → parse_failed", async () => {
  assert.equal((await discoverRegistryProxy({ runner: async () => ({ ok: true, code: 0, stdout: "ENABLE=0\nSERVER=http=127.0.0.1:9999\n", stderr: "" }) })).state, "disabled");
  assert.equal((await discoverRegistryProxy({ runner: async () => ({ ok: true, code: 0, stdout: "ENABLE=1\nSERVER=\n", stderr: "" }) })).state, "no_value");
  assert.equal((await discoverRegistryProxy({ runner: async () => ({ ok: true, code: 0, stdout: "unexpected", stderr: "" }) })).state, "parse_failed");
  assert.equal((await discoverRegistryProxy({ runner: async () => ({ ok: true, code: 0, stdout: "ENABLE=1\nSERVER=garbage\n", stderr: "" }) })).state, "parse_failed");
});

// ---------- netstat 发现（P1-2 runner 注入） ----------
test("netstat runner 失败 → query_failed 明确记录，不误判无监听（复核场景 7）", async () => {
  const r = await discoverNetstatPorts({ runner: async () => ({ ok: false, code: 1, stdout: "", stderr: "netstat error" }) });
  assert.equal(r.state, "query_failed");
  assert.deepEqual(r.ports, []);
  assert.match(r.detail, /netstat error/);
});

test("netstat 输出解析：仅取 127.*/0.0.0.0 的 LISTENING，去重、排除 ESTABLISHED/UDP/>65535", () => {
  const sample = [
    "  Proto  Local Address          Foreign Address        State           PID",
    "  TCP    127.0.0.1:3572         0.0.0.0:0              LISTENING       8280",
    "  TCP    0.0.0.0:2482           0.0.0.0:0              LISTENING       8280",
    "  TCP    127.0.0.1:5354         0.0.0.0:0              LISTENING       4321",
    "  TCP    192.168.1.5:139        0.0.0.0:0              LISTENING       4568",
    "  TCP    127.0.0.1:70000        0.0.0.0:0              LISTENING       999",
    "  TCP    127.0.0.1:3572         127.0.0.1:5000         ESTABLISHED     8280",
    "  UDP    127.0.0.1:1900         *:*                                    1234",
  ].join("\n");
  assert.deepEqual(parseNetstatListeners(sample), [3572, 2482, 5354]);
});

// ---------- portsFromGitConfigEntries（P2-1：保留主机判定） ----------
test("git config 条目：本机地址取端口；非法 URL/无端口/非本机/非法端口 → skipped 带原因", () => {
  const r = portsFromGitConfigEntries([
    { key: "http.proxy", val: "http://127.0.0.1:6822" },
    { key: "http.https://github.com.proxy", val: "http://127.0.0.1:6822" },
    { key: "http.proxy", val: "not-a-url" },
    { key: "http.proxy", val: "http://127.0.0.1" },
    { key: "http.proxy", val: "http://proxy.example.com:8080" },
    { key: "http.proxy", val: "http://127.0.0.1:70000" },
  ]);
  assert.deepEqual(r.ports, [
    { port: 6822, source: "git config http.proxy" },
    { port: 6822, source: "git config http.https://github.com.proxy" },
  ]);
  const reasons = r.skipped.map((s) => s.reason);
  assert.equal(reasons.filter((x) => x.includes("非法 URL（含端口越界）")).length, 2); // not-a-url 与 70000（URL 构造器拒绝越界端口）
  assert.ok(reasons.some((x) => x.includes("无端口")));
  assert.ok(reasons.some((x) => x.includes("proxy.example.com") && x.includes("非本机地址")));
});

// ---------- buildCandidateQueue（共识 2：发现序 + 去重 + P1-3 非法过滤） ----------
test("候选队列：发现序=注册表→git config→env→--ports→netstat 末位；补标来源不重复；特权端口过滤", () => {
  const { queue, rejected } = buildCandidateQueue({
    registryPorts: [{ port: 3572, source: "注册表ProxyServer(https)" }],
    gitConfigPorts: [{ port: 6822, source: "git config http.proxy" }],
    envPorts: ["1111"],
    cliPorts: ["2222"],
    netstatPorts: [3572, 445, 9090],
  });
  assert.equal(rejected.length, 0);
  assert.deepEqual(queue.map((c) => c.port), [3572, 6822, 1111, 2222, 9090]);
  assert.deepEqual(queue.find((c) => c.port === 3572).sources, ["注册表ProxyServer(https)", "netstat"]);
  assert.equal(queue.find((c) => c.port === 9090).note, "监听未证实代理（须真实探测）");
});

test("候选队列：非法端口 0/65536/1.5/-1/Infinity 过滤并返回 rejected（复核场景 1-4，不静默）", () => {
  const { queue, rejected } = buildCandidateQueue({
    registryPorts: [{ port: 0, source: "注册表ProxyServer(http)" }],
    gitConfigPorts: [{ port: 65536, source: "git config http.proxy" }],
    envPorts: [1.5, -1],
    cliPorts: [Infinity, 3572],
  });
  assert.deepEqual(queue.map((c) => c.port), [3572]);
  assert.equal(rejected.length, 5);
  assert.ok(rejected.every((r) => r.reason.includes("非法端口")));
});

test("候选队列：netstat 新端口截断上限 + 特权端口过滤", () => {
  const { queue } = buildCandidateQueue({
    netstatPorts: [20001, 20002, 20003, 20004, 20005, 20006, 20007, 139, 5040],
    netstatLimit: 3,
  });
  assert.deepEqual(queue.map((c) => c.port), [20001, 20002, 20003]); // 139/5040 被过滤，7 只取 3
});

test("候选队列：字符串端口归一化为数字", () => {
  const { queue } = buildCandidateQueue({ cliPorts: ["3572"] });
  assert.equal(queue[0].port, 3572);
  assert.deepEqual(queue[0].sources, ["--ports"]);
});

// ---------- probeCandidate（P1-2：TCP 预筛 + dry-run 注入） ----------
test("TCP 预筛失败 → 跳过且 dry-run 不执行（复核场景 8）", async () => {
  let dryRunCalled = 0;
  const r = await probeCandidate({
    candidate: { port: 9999, sources: ["--ports"] },
    tcpProbe: async () => false,
    dryRun: async () => { dryRunCalled++; return { ok: true, timedOut: false, stderr: "", ms: 1 }; },
  });
  assert.equal(r.tcpSkipped, true);
  assert.equal(dryRunCalled, 0);
  assert.equal(r.tried[0].stderr, "TCP 未监听");
  assert.equal(r.win, null);
});

test("TCP 通过 → dry-run 执行；成功产出 win", async () => {
  const r = await probeCandidate({
    candidate: { port: 3572, sources: ["注册表ProxyServer(https)"] },
    tcpProbe: async () => true,
    dryRun: async (label) => ({ ok: true, timedOut: false, stderr: "", ms: 5, calledLabel: label }),
  });
  assert.equal(r.tcpSkipped, undefined);
  assert.equal(r.win.port, 3572);
  assert.match(r.tried[0].label, /3572/);
});

// ---------- runProbeSequence（P1-1 超时分离流程） ----------
test("直连 timeout → 及时进入候选验证（复核场景 5）", async () => {
  const calls = [];
  const seq = await runProbeSequence({
    candidates: [{ port: 3572, sources: ["reg"] }],
    directProbe: async () => { calls.push("direct"); return { label: "直连", port: null, ok: false, timedOut: true, stderr: "", ms: 30000 }; },
    candidateProbe: async (c) => { calls.push("cand" + c.port); return { tried: [{ label: "p" + c.port, ok: true, timedOut: false, stderr: "", ms: 10 }], win: { label: "p" + c.port, port: c.port } }; },
  });
  assert.deepEqual(calls, ["direct", "cand3572"]);
  assert.equal(seq.winner.port, 3572);
});

test("第一个候选 dry-run timeout → 记录 timeout 并继续第二个候选（复核场景 6/9）", async () => {
  const triedSeq = [];
  const seq = await runProbeSequence({
    candidates: [{ port: 1111, sources: ["a"] }, { port: 2222, sources: ["b"] }],
    directProbe: async () => ({ label: "直连", port: null, ok: false, timedOut: false, stderr: "reset", ms: 100 }),
    candidateProbe: async (c) => {
      if (c.port === 1111) {
        const e = { label: "p1111", ok: false, timedOut: true, stderr: "killed", ms: 45000 };
        triedSeq.push(e);
        return { tried: [e], win: null };
      }
      const e = { label: "p2222", ok: true, timedOut: false, stderr: "", ms: 50 };
      triedSeq.push(e);
      return { tried: [e], win: { label: "p2222", port: 2222 } };
    },
  });
  assert.equal(seq.winner.port, 2222);
  assert.equal(seq.tried.length, 3); // 直连 + 两个候选
  assert.equal(seq.tried[1].timedOut, true);
});

test("直连成功 → 不进入候选验证；全部候选失败 → winner=null 且逐条记录", async () => {
  const seq1 = await runProbeSequence({
    candidates: [{ port: 1111, sources: ["a"] }],
    directProbe: async () => ({ label: "直连", port: null, ok: true, timedOut: false, stderr: "", ms: 10 }),
    candidateProbe: async () => { throw new Error("不应被调用"); },
  });
  assert.equal(seq1.winner.port, null);
  const seq2 = await runProbeSequence({
    candidates: [{ port: 1111, sources: ["a"] }],
    directProbe: async () => ({ label: "直连", port: null, ok: false, timedOut: false, stderr: "x", ms: 10 }),
    candidateProbe: async () => ({ tried: [{ label: "p1111", ok: false, timedOut: false, stderr: "TCP 未监听", ms: 0 }], win: null }),
  });
  assert.equal(seq2.winner, null);
  assert.equal(seq2.tried.length, 2);
});

// ---------- probePort 三态（R2 复核 P1-1 遗留整改：超时≠未监听≠拒绝） ----------
function makeHangingSocket() {
  // 模拟永不完成连接的 socket：真实 timer 走 probePort 的超时分支
  let timer = null;
  return {
    setTimeout(ms, cb) { timer = setTimeout(cb, ms); },
    once() {},
    destroy() { if (timer) clearTimeout(timer); },
  };
}

test("probePort：真实 loopback 监听端口 → 连接成功三态 {ok,timedOut:false,reason:connected}", async () => {
  const server = net.createServer(() => {});
  await new Promise((res) => server.listen(0, "127.0.0.1", res));
  const port = server.address().port;
  try {
    const r = await probePort(port, "127.0.0.1");
    assert.equal(r.ok, true);
    assert.equal(r.timedOut, false);
    assert.equal(r.reason, "connected");
    assert.equal(typeof r.ms, "number");
  } finally { server.close(); }
});

test("probePort：真实 loopback 已关闭端口 → 连接拒绝（非超时，ECONNREFUSED）", async () => {
  const server = net.createServer(() => {});
  await new Promise((res) => server.listen(0, "127.0.0.1", res));
  const port = server.address().port;
  await new Promise((res) => server.close(res));
  const r = await probePort(port, "127.0.0.1");
  assert.equal(r.ok, false);
  assert.equal(r.timedOut, false);
  assert.match(r.reason, /连接失败（ECONNREFUSED）/);
});

test("probePort：注入挂起 socket（真实 timer）→ 超时三态 timedOut=true ≠永久不可用", async () => {
  const r = await probePort(59999, "127.0.0.1", 40, { createSocket: () => makeHangingSocket() });
  assert.equal(r.ok, false);
  assert.equal(r.timedOut, true);
  assert.match(r.reason, /timeout（本次探测超时≠路径永久不可用）/);
});

test("probeCandidate：TCP 探测超时保留独立状态（timedOut:true，不标'未监听'），dry-run 不执行", async () => {
  let dryRunCalled = 0;
  const r = await probeCandidate({
    candidate: { port: 61234, sources: ["--ports"] },
    tcpProbe: async () => ({ ok: false, timedOut: true, ms: 2000, reason: "timeout（本次探测超时≠路径永久不可用）" }),
    dryRun: async () => { dryRunCalled++; return { ok: true, timedOut: false, stderr: "", ms: 1 }; },
  });
  assert.equal(r.tcpSkipped, true);
  assert.equal(r.win, null);
  assert.equal(dryRunCalled, 0);
  assert.equal(r.tried[0].timedOut, true);
  assert.match(r.tried[0].stderr, /TCP 探测超时（本次探测超时≠路径永久不可用）/);
});

test("probeCandidate：真实拒绝端口（默认 probePort）→ 'TCP 未监听（连接失败（ECONNREFUSED））'且非超时", async () => {
  const server = net.createServer(() => {});
  await new Promise((res) => server.listen(0, "127.0.0.1", res));
  const port = server.address().port;
  await new Promise((res) => server.close(res));
  const r = await probeCandidate({ candidate: { port, sources: ["netstat"] }, dryRun: async () => { throw new Error("不应执行"); } });
  assert.equal(r.tcpSkipped, true);
  assert.equal(r.tried[0].timedOut, false);
  assert.match(r.tried[0].stderr, /TCP 未监听（连接失败（ECONNREFUSED））/);
});
