// AIEO Phase 0 返工 R10 — S4 场景脚本：持有者硬杀 → 内核自动释放 → 下一实例接管
// 独立进程树运行（与已验证的隔离实验同构），结果写入 JSON 供主测试断言。
import { spawn } from "node:child_process";
import fs from "node:fs";
import { join, dirname } from "node:path";
import { pathToFileURL } from "node:url";

const dir = fs.mkdtempSync("C:/Users/youting/AppData/Local/Temp/s4scen-");
const CHILD = join(dir, "holder_child.mjs");
const result = { scenario: "S4", steps: [] };
const out = process.argv[2];
fs.writeFileSync(CHILD, `import { acquireSessionLock } from ${JSON.stringify(pathToFileURL("D:/AIEO/phase0/e2e-poc/session_lock.mjs").href)};
import { writeFileSync } from "node:fs";
const lock = acquireSessionLock({ lockPath: process.argv[3], holder: "holder-child" });
writeFileSync(process.argv[2], "acquired");
setTimeout(() => { lock.release(); }, 30000);
`);

const lockPath = join(dir, "l4.lockfile");
const holderOut = join(dir, "holder-out.json");
const holder = spawn(process.execPath, [CHILD, holderOut, lockPath], { stdio: "ignore" });

// 1. 等 holder 子进程 acquire（outcome 文件出现）
let held = false;
for (let i = 0; i < 150; i++) {
  await new Promise((r) => setTimeout(r, 100));
  if (fs.existsSync(holderOut)) { held = true; break; }
}
result.steps.push({ step: "holder_acquired", pass: held });
if (!held) {
  fs.writeFileSync(out, JSON.stringify({ ...result, pass: false, error: "holder 未能在 15s 内 acquire" }), "utf8");
  process.exit(1);
}

// 2. 硬杀 holder 子进程（无 release、无清理）
holder.kill("SIGKILL");
result.steps.push({ step: "sigkill", pass: true });

// 3. 等守护进程随父死退出（≤2s），下一实例必须能接管
await new Promise((r) => setTimeout(r, 2000));
let takeover = false;
try {
  const { acquireSessionLock } = await import(pathToFileURL("D:/AIEO/phase0/e2e-poc/session_lock.mjs").href);
  const lock = acquireSessionLock({ lockPath, holder: "next-instance" });
  takeover = true;
  lock.release();
} catch (e) {
  result.takeover_error = String(e.message).slice(0, 150);
}
result.steps.push({ step: "next_instance_takeover", pass: takeover });

result.pass = held && takeover;
fs.writeFileSync(out, JSON.stringify(result, null, 2), "utf8");
process.exit(result.pass ? 0 : 1);
