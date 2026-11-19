// 负面对照机器证据（b-20261119-gitpointer-dispatcher-null-fix S4 R1 整改项⑥）。
// 独立复现：Node v24 + 本地 HTTP 服务 + fetch(url,{dispatcher:null}) → ERR_ASSERTION。
// 目的：证明 dispatcher:null 归一回归测试非"改前改后都 PASS"的空心测试（L-017）。
// 不访问真实 GitHub；脚本本身即证据来源，输出落 phase0/logs/gpfix-negative-control.json。
import { createServer } from "node:http";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const server = createServer((req, res) => { res.writeHead(200); res.end("ok"); });
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const url = `http://127.0.0.1:${server.address().port}/`;
const before = process.version;
let observed = null;
try {
  // 缺陷形态：与修复前 fetchGitPointerBytes 传给 fetch 的 dispatcher:null 完全同型
  await globalThis.fetch(url, { dispatcher: null });
  observed = { threw: false };
} catch (error) {
  observed = { threw: true, code: error.code ?? null, name: error.name ?? null, message: error.message ?? null };
} finally {
  await new Promise((resolve) => server.close(resolve));
}
const payload = {
  task: "b-20261119-gitpointer-dispatcher-null-fix",
  purpose: "negative-control: prove dispatcher:null triggers ERR_ASSERTION on Node v24 (fix is non-vacuous)",
  node: before,
  command: "node phase0/tools/gpfix_neg_control.mjs",
  target: "local HTTP server (createServer listen 0 on 127.0.0.1, no real GitHub)",
  injected_fetch_init: { dispatcher: null },
  observed,
  assertion: observed.threw === true && observed.code === "ERR_ASSERTION",
  extracted_at: new Date().toISOString(),
};
const outPath = join(process.cwd(), "phase0", "logs", "gpfix-negative-control.json");
writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(JSON.stringify(payload, null, 2));
console.log(`证据文件: ${outPath}`);
if (!payload.assertion) process.exitCode = 1;
