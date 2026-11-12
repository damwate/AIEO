// 真实 Chrome + Playwright 驱动本地虚拟列表仿真页。
// 证据范围严格为“真实浏览器仿真 DOM”，绝非真实 ChatGPT 多 unit 证据。
import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { readReplySnapshot } from "./inbound_dom.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(__dirname, "virtual-list-fixture.html");
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const evidenceDir = join(__dirname, "..", "logs", `browser-virtual-list-${stamp}`);
mkdirSync(evidenceDir, { recursive: true });
copyFileSync(fixturePath, join(evidenceDir, "fixture-source.html"));
const startedAt = new Date().toISOString();
const results = [];
const consoleLines = [];
const chromePath = process.env.AIEO_CHROME_EXECUTABLE || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
let browser;
let chromeVersion = null;

function errorDetails(error) {
  return { code: error.code ?? null, message: error.message, details: error.details ?? null };
}

async function captureScenario(name, fn) {
  const record = { name, simulation_only: true, started_at: new Date().toISOString() };
  try {
    await fn(record);
    record.result = "PASS";
  } catch (error) {
    record.result = "FAIL";
    record.test_error = errorDetails(error);
  }
  record.finished_at = new Date().toISOString();
  try {
    writeFileSync(join(evidenceDir, `${name}-dom.html`), await browserPage.content(), "utf8");
    await browserPage.screenshot({ path: join(evidenceDir, `${name}.png`), fullPage: true });
    record.dom_path = join(evidenceDir, `${name}-dom.html`);
    record.screenshot_path = join(evidenceDir, `${name}.png`);
  } catch (error) {
    record.capture_error = errorDetails(error);
    record.result = "FAIL";
  }
  results.push(record);
}

let browserPage;
try {
  browser = await chromium.launch({ executablePath: chromePath, headless: true });
  chromeVersion = browser.version();
  browserPage = await browser.newPage({ viewport: { width: 1100, height: 800 } });
  browserPage.on("console", (message) => {
    consoleLines.push(`[${new Date().toISOString()}] ${message.type()} ${message.text()}`);
  });
  browserPage.on("pageerror", (error) => {
    consoleLines.push(`[${new Date().toISOString()}] pageerror ${error.message}`);
  });
  await browserPage.goto(pathToFileURL(fixturePath).href, { waitUntil: "load" });
  await browserPage.waitForFunction(() => Boolean(window.fixture));
  const expectedUnitKeys = await browserPage.evaluate(() => window.fixture.logicalUnitKeys());

  await captureScenario("01-multi-assistant-positive", async (record) => {
    await browserPage.evaluate(() => {
      window.fixture.setMode("normal");
      window.fixture.goBottom();
    });
    const before = await browserPage.evaluate(() => window.fixture.state());
    const snapshot = await readReplySnapshot(browserPage, "target:user", { expectedUnitKeys });
    assert.equal(snapshot.unit_count, 5);
    assert.deepEqual(snapshot.unit_keys, [
      "target-a0:assistant", "target-a1:assistant", "target-a2:assistant",
      "target-a3:assistant", "target-a4:assistant",
    ]);
    assert.equal(snapshot.reply, [
      "assistant 第 0 段", "assistant 第 1 段", "assistant 第 2 段（持续裁切负例目标）",
      "assistant 第 3 段", "assistant 第 4 段",
    ].join("\n"));
    assert.equal(snapshot.next_user_unit_key, "next:user");
    assert.equal(snapshot.range_proof.window_integrity.method, "INDEPENDENT_LOGICAL_UNIT_SEQUENCE");
    assert.ok(snapshot.range_proof.windows.length >= 2);
    const after = await browserPage.evaluate(() => window.fixture.state());
    assert.ok(after.renderCount > before.renderCount);
    record.before = before;
    record.after = after;
    record.snapshot = snapshot;
  });

  await captureScenario("02-persistent-middle-crop-negative", async (record) => {
    await browserPage.evaluate(() => {
      window.fixture.setMode("hide-middle");
      window.fixture.goBottom();
    });
    let observed = null;
    try {
      await readReplySnapshot(browserPage, "target:user", { expectedUnitKeys });
    } catch (error) {
      observed = errorDetails(error);
    }
    assert.equal(observed?.code, "INBOUND_WINDOW_COMPLETENESS_FAILED");
    assert.ok(observed.details.missing_unit_keys.includes("target-a2:assistant"));
    record.outcome = "BLOCKED";
    record.observed_error = observed;
    record.final_rendered_units = await browserPage.evaluate(() => window.fixture.renderedUnitKeys());
  });

  await captureScenario("03-restored-middle-positive", async (record) => {
    await browserPage.evaluate(() => window.fixture.setMode("normal"));
    const snapshot = await readReplySnapshot(browserPage, "target:user", { expectedUnitKeys });
    assert.equal(snapshot.unit_count, 5);
    assert.ok(snapshot.unit_keys.includes("target-a2:assistant"));
    assert.equal(snapshot.range_proof.complete, true);
    record.snapshot = snapshot;
    record.final_rendered_units = await browserPage.evaluate(() => window.fixture.renderedUnitKeys());
  });

  await captureScenario("04-no-independent-sequence-conservative-blocked", async (record) => {
    await browserPage.evaluate(() => {
      window.fixture.setMode("normal");
      window.fixture.goBottom();
    });
    let observed = null;
    try {
      await readReplySnapshot(browserPage, "target:user");
    } catch (error) {
      observed = errorDetails(error);
    }
    assert.equal(observed?.code, "INBOUND_WINDOW_COMPLETENESS_UNPROVEN");
    record.outcome = "BLOCKED";
    record.observed_error = observed;
    record.boundary = "窗口重叠不能证明所有窗口均未持续遗漏同一中间 unit；无可信逻辑序列时拒绝完整判定";
  });
} catch (error) {
  results.push({ name: "browser-harness", result: "FAIL", test_error: errorDetails(error) });
} finally {
  if (browser) await browser.close();
}

const failed = results.filter((result) => result.result !== "PASS").length;
const report = {
  started_at: startedAt,
  finished_at: new Date().toISOString(),
  evidence_scope: "REAL_CHROME_PLAYWRIGHT_LOCAL_SIMULATED_DOM_NOT_CHATGPT",
  real_chrome: true,
  real_chatgpt_multi_unit: false,
  remote_chatgpt_evidence: false,
  fixture_path: fixturePath,
  chrome_executable: chromePath,
  chrome_version: chromeVersion,
  node: process.version,
  total: results.length,
  passed: results.length - failed,
  failed,
  tests: results,
};
const consolePath = join(evidenceDir, "browser-console.log");
const logPath = join(evidenceDir, "run.log");
const jsonPath = join(evidenceDir, "result.json");
writeFileSync(consolePath, `${consoleLines.join("\n")}\n`, "utf8");
const lines = [
  `[${startedAt}] 真实浏览器仿真 DOM 测试开始；不是 ChatGPT 真实多 unit`,
  ...results.map((result) => `[${result.finished_at}] ${result.result} ${result.name}${result.outcome ? ` outcome=${result.outcome}` : ""}${result.test_error ? ` error=${result.test_error.message}` : ""}`),
  `[${report.finished_at}] SUMMARY total=${report.total} passed=${report.passed} failed=${failed}`,
];
writeFileSync(logPath, `${lines.join("\n")}\n`, "utf8");
writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(lines.join("\n"));
console.log(`结构化结果: ${jsonPath}`);
console.log(`控制台日志: ${consolePath}`);
if (failed > 0) process.exitCode = 1;
