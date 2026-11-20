// trial T1a 前后 DOM 对照审计：列出全部打开页的 URL + user 单元数 + 尾部键。
// 用法：node trial_t1a_dom_audit.mjs <阶段标签>  → 落盘 phase0/logs/trial-t1a-audit-<标签>.json
import { chromium } from "playwright";
import { readDomUnits } from "./inbound_dom.mjs";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const label = process.argv[2] || "unlabeled";
const OUT = join(process.cwd(), "phase0", "logs", `trial-t1a-audit-${label}.json`);
const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const ctx = browser.contexts()[0];
const pages = [];
for (const page of ctx.pages()) {
  const url = page.url();
  let units = [];
  try {
    units = await readDomUnits(page);
  } catch (e) {
    pages.push({ url, error: String(e && e.message) });
    continue;
  }
  const users = units.filter((u) => u.role === "user");
  const last = units[units.length - 1];
  pages.push({
    url,
    unit_count: units.length,
    user_unit_count: users.length,
    tail_role: last ? last.role : null,
    tail_key: last ? last.key : null,
    user_keys: users.map((u) => u.key),
  });
}
const audit = { label, audited_at: new Date().toISOString(), pages };
writeFileSync(OUT, JSON.stringify(audit, null, 2), "utf8");
console.log(JSON.stringify(audit, null, 2));
await browser.close().catch(() => {});
