// toolkit/test-check-push.mjs —— check-push.mjs 发现/验证逻辑单元测试
// 运行：node toolkit/test-check-push.mjs（node:test，直接运行即执行并按结果置退出码）
// 覆盖（2026-11-14 代理共识五条，dispatch-15-39-58）：
//   分协议解析 / 三态注册表发现（查询失败≠无代理）/ netstat 监听解析 / 候选队列去重与发现序
import test from "node:test";
import assert from "node:assert/strict";
import {
  parseProxyServerString,
  discoverRegistryProxy,
  parseNetstatListeners,
  buildCandidateQueue,
  portsFromGitConfigEntries,
} from "./check-push.mjs";

// ---------- parseProxyServerString（共识 1：按协议解析） ----------
test("分协议串：SakuraCat 格式，三协议同端口，preferred=3572", () => {
  const r = parseProxyServerString("http=127.0.0.1:3572;https=127.0.0.1:3572;socks=127.0.0.1:3572");
  assert.equal(r.ok, true);
  assert.equal(r.format, "per-protocol");
  assert.deepEqual(r.ports, { http: 3572, https: 3572, socks: 3572 });
  assert.equal(r.preferred, 3572);
});

test("分协议串：各协议端口不同时，https 优先", () => {
  const r = parseProxyServerString("http=127.0.0.1:1111;https=127.0.0.1:2222;socks=127.0.0.1:3333");
  assert.equal(r.ok, true);
  assert.equal(r.preferred, 2222);
  assert.deepEqual(r.ports, { http: 1111, https: 2222, socks: 3333 });
});

test("传统串：host:port", () => {
  const r = parseProxyServerString("127.0.0.1:8080");
  assert.equal(r.ok, true);
  assert.equal(r.format, "legacy");
  assert.equal(r.preferred, 8080);
});

test("空值 → reason=empty", () => {
  assert.deepEqual(parseProxyServerString(""), { ok: false, reason: "empty", raw: "" });
  assert.equal(parseProxyServerString("   ").reason, "empty");
  assert.equal(parseProxyServerString(null).reason, "empty");
});

test("垃圾值 → parse_failed（不是 empty，不是误判无值）", () => {
  const r = parseProxyServerString("nonsense");
  assert.equal(r.ok, false);
  assert.equal(r.reason, "parse_failed");
});

// ---------- discoverRegistryProxy（共识 5：三态，查询失败≠无代理） ----------
test("注册表查询失败（模拟 runner 抛错，实际注册表有值）→ state=query_failed，禁止当'无代理'", async () => {
  const r = await discoverRegistryProxy({
    runner: async () => { throw new Error("powershell 不可用"); },
  });
  assert.equal(r.state, "query_failed");
  assert.deepEqual(r.ports, []);
  assert.match(r.detail, /runner 异常/);
  // 关键断言：query_failed 状态下没有任何端口候选，但状态本身可识别（非静默、非"无值"）
  assert.notEqual(r.state, "no_value");
});

test("注册表查询失败（runner 返回非零退出码）→ state=query_failed 且带 stderr 详情", async () => {
  const r = await discoverRegistryProxy({
    runner: async () => ({ ok: false, code: 1, stdout: "", stderr: "ACCESS DENIED" }),
  });
  assert.equal(r.state, "query_failed");
  assert.match(r.detail, /ACCESS DENIED/);
});

test("注册表正常：ProxyEnable=1 + 分协议串 → ok，端口带来源标签", async () => {
  const r = await discoverRegistryProxy({
    runner: async () => ({
      ok: true, code: 0,
      stdout: "ENABLE=1\nSERVER=http=127.0.0.1:3572;https=127.0.0.1:3572;socks=127.0.0.1:3572\n",
      stderr: "",
    }),
  });
  assert.equal(r.state, "ok");
  assert.equal(r.preferred, 3572);
  assert.ok(r.ports.some((p) => p.port === 3572 && p.source.includes("注册表ProxyServer")));
});

test("ProxyEnable=0 → state=disabled（有值但未启用，非查询失败）", async () => {
  const r = await discoverRegistryProxy({
    runner: async () => ({ ok: true, code: 0, stdout: "ENABLE=0\nSERVER=http=127.0.0.1:9999\n", stderr: "" }),
  });
  assert.equal(r.state, "disabled");
  assert.deepEqual(r.ports, []);
});

test("ProxyEnable=1 但 SERVER 空 → state=no_value（唯一允许'无值'结论的状态）", async () => {
  const r = await discoverRegistryProxy({
    runner: async () => ({ ok: true, code: 0, stdout: "ENABLE=1\nSERVER=\n", stderr: "" }),
  });
  assert.equal(r.state, "no_value");
});

test("输出格式异常（缺 ENABLE/SERVER 行）→ state=parse_failed", async () => {
  const r = await discoverRegistryProxy({
    runner: async () => ({ ok: true, code: 0, stdout: "unexpected output", stderr: "" }),
  });
  assert.equal(r.state, "parse_failed");
});

test("SERVER 无法解析 → state=parse_failed（有值但解析失败，修解析而非判无）", async () => {
  const r = await discoverRegistryProxy({
    runner: async () => ({ ok: true, code: 0, stdout: "ENABLE=1\nSERVER=garbage-value\n", stderr: "" }),
  });
  assert.equal(r.state, "parse_failed");
});

// ---------- parseNetstatListeners ----------
test("netstat 输出：仅取 127.*/0.0.0.0 的 LISTENING，去重、排除 ESTABLISHED 与外部地址", () => {
  const sample = [
    "  Proto  Local Address          Foreign Address        State           PID",
    "  TCP    127.0.0.1:3572         0.0.0.0:0              LISTENING       8280",
    "  TCP    0.0.0.0:2482           0.0.0.0:0              LISTENING       8280",
    "  TCP    127.0.0.1:5354         0.0.0.0:0              LISTENING       4321",
    "  TCP    192.168.1.5:139        0.0.0.0:0              LISTENING       4568",
    "  TCP    127.0.0.1:3572         127.0.0.1:5000         ESTABLISHED     8280",
    "  UDP    127.0.0.1:1900         *:*                                    1234",
  ].join("\n");
  assert.deepEqual(parseNetstatListeners(sample), [3572, 2482, 5354]);
});

// ---------- buildCandidateQueue（共识 2：发现序 + 去重） ----------
test("候选队列：发现序=注册表→git config→env→--ports→netstat 末位；netstat 补标来源不重复；特权端口过滤", () => {
  const q = buildCandidateQueue({
    registryPorts: [{ port: 3572, source: "注册表ProxyServer(https)" }],
    gitConfigPorts: [{ port: 6822, source: "git config http.proxy" }],
    envPorts: ["1111"],
    cliPorts: ["2222"],
    netstatPorts: [3572, 445, 9090],
  });
  // 445<1024 被 netstat 噪音过滤；3572 补标 netstat 来源不占截断名额
  assert.deepEqual(q.map((c) => c.port), [3572, 6822, 1111, 2222, 9090]);
  const p3572 = q.find((c) => c.port === 3572);
  assert.deepEqual(p3572.sources, ["注册表ProxyServer(https)", "netstat"]); // 补标，不占截断名额
  assert.equal(q.find((c) => c.port === 9090).note, "监听未证实代理（须真实探测）");
});

test("候选队列：netstat 新端口截断上限 + 特权端口过滤", () => {
  const q = buildCandidateQueue({
    netstatPorts: [20001, 20002, 20003, 20004, 20005, 20006, 20007, 139, 5040],
    netstatLimit: 3,
  });
  assert.deepEqual(q.map((c) => c.port), [20001, 20002, 20003]); // 139/5040 被过滤，7 只取 3
});

test("候选队列：字符串端口归一化为数字", () => {
  const q = buildCandidateQueue({ cliPorts: ["3572"] });
  assert.equal(q[0].port, 3572);
  assert.deepEqual(q[0].sources, ["--ports"]);
});

// ---------- portsFromGitConfigEntries ----------
test("git config 条目端口提取（含非法 URL 忽略）", () => {
  const ports = portsFromGitConfigEntries([
    { key: "http.proxy", val: "http://127.0.0.1:6822" },
    { key: "http.https://github.com.proxy", val: "http://127.0.0.1:6822" },
    { key: "http.proxy", val: "not-a-url" },
  ]);
  assert.deepEqual(ports, [
    { port: 6822, source: "git config http.proxy" },
    { port: 6822, source: "git config http.https://github.com.proxy" },
  ]);
});
