// M2 DOM 视图适配层：真实浏览器（Playwright CDP 接管，DEC-002）与测试夹具共用同一套
// 上层采集逻辑。视图只暴露最小接口（见 ChatgptDomView 注释），采集/区间证明逻辑全部
// 复用 inbound_reply.mjs 的纯函数，保证仿真与真实路径同一算法。

import {
  bodyTextDocument,
  composerProbeDocument,
  extractUnitsDocument,
  readTailUnitDocument,
  scrollByDocument,
  scrollStateDocument,
  stopButtonVisibleDocument,
} from "./dom_extract.mjs";
import {
  createInboundRangeCollector,
  proveAdjacentWindowOverlap,
  selectInboundReply,
} from "./inbound_reply.mjs";
import { controllerError } from "./errors.mjs";

// ChatgptDomView 接口：
//   listUnits() → [{key, role, text, assistantUuid, visible}]（全部渲染 unit，DOM 顺序）
//   scrollState() → {at_top, at_bottom, scrollable, scroll_top, scroll_height, client_height}
//   scrollBy(direction) → {before, after}
//   stopButtonVisible() → boolean
//   composerText() → string|null（null = composer 不存在）
//   insertComposerText(text) → void
//   pressEnter() → void
//   focusComposer() → void
//   navigate(url) → void（轮换流程跳转主页用）
//   sleep(ms) → Promise
//   now() → number（虚拟时钟注入点）

// 在页面上下文执行自包含 DOM 函数：以 toString 传入，避免测试夹具与真实浏览器出现两套实现。
export async function evaluateDocumentFunction(page, documentFunction, arg) {
  return page.evaluate((source, a) => {
    const fn = new Function(`return (${source})`)();
    return fn(document, a);
  }, documentFunction.toString(), arg);
}

// 真实浏览器视图（Playwright Page）。
export function createPlaywrightDomView(page, { composerTimeoutMs = 10000 } = {}) {
  return {
    kind: "playwright",
    page,
    composerTimeoutMs,
    async evaluateDocument(documentFunction) {
      return evaluateDocumentFunction(page, documentFunction);
    },
    async listUnits() {
      return evaluateDocumentFunction(page, extractUnitsDocument);
    },
    async readTailUnit() {
      return evaluateDocumentFunction(page, readTailUnitDocument);
    },
    async scrollState() {
      return evaluateDocumentFunction(page, scrollStateDocument);
    },
    async scrollBy(direction) {
      return evaluateDocumentFunction(page, scrollByDocument, direction);
    },
    async stopButtonVisible() {
      return evaluateDocumentFunction(page, stopButtonVisibleDocument);
    },
    async bodyText() {
      return evaluateDocumentFunction(page, bodyTextDocument);
    },
    async composerText() {
      const probe = await evaluateDocumentFunction(page, composerProbeDocument);
      return probe.present ? probe.text : null;
    },
    async focusComposer() {
      const locator = page.locator('[aria-label="询问 ChatGPT"], [aria-label="Ask ChatGPT"], #prompt-textarea')
        .filter({ visible: true }).first();
      await locator.waitFor({ state: "visible", timeout: composerTimeoutMs });
      await locator.click();
    },
    async insertComposerText(text) {
      await page.evaluate((t) => document.execCommand("insertText", false, t), text);
    },
    async pressEnter() {
      await page.keyboard.press("Enter");
    },
    async navigate(url) {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    },
    async sleep(ms) {
      await page.waitForTimeout(ms);
    },
    url() {
      return page.url();
    },
    now() {
      return Date.now();
    },
  };
}

function windowError(code, message, details = undefined) {
  return controllerError(code, message, details === undefined ? {} : { details });
}

export async function readDomWindow(view) {
  const units = await view.listUnits();
  const scroll = await view.scrollState();
  return { units, ...scroll };
}

export async function readTailUnit(view) {
  return view.readTailUnit();
}

function findStartIndex(windowUnits, userUnitKey) {
  return windowUnits.findIndex((unit) => unit.key === userUnitKey && unit.role === "user");
}

// 两段式实体化（port 自 phase0/tools/inbound_dom.mjs readReplySnapshot）：
// 先向上逐窗定位起点，再向下逐窗收集至下一 user 或真实底部。
// expectedUnitKeys 必须来自独立于渲染 DOM 的逻辑序列（仅测试/已有可信清单可提供）。
// maxAssistantUnits 透传 DEC-017 扩展门禁（默认 1）；仅测试可放宽，真实路径由 dispatch.mjs 收敛点无条件复核。
export async function readReplySnapshot(view, userUnitKey, { expectedUnitKeys = null, maxWindowTransitions = 200, maxAssistantUnits = 1 } = {}) {
  const readStartedAt = view.now();
  let current = await readDomWindow(view);
  if (current.units.length === 0) throw windowError("INBOUND_WINDOW_EMPTY", "页面没有已渲染 unit");
  let previousSearch = null;
  const searchProof = [];
  let transitions = 0;

  for (;;) {
    if (previousSearch) {
      const overlap = proveAdjacentWindowOverlap(previousSearch.units, current.units);
      searchProof.push({ unit_keys: current.units.map((unit) => unit.key), ...overlap });
    } else {
      searchProof.push({ unit_keys: current.units.map((unit) => unit.key), overlap_keys: [] });
    }
    const startFound = findStartIndex(current.units, userUnitKey) >= 0;
    // 可滚动页面即使起点和尾部同屏 DOM 存在，也先向上离开底部，再向下分段复核。
    if (startFound && (!current.at_bottom || !current.scrollable)) break;
    if (current.at_top) {
      throw windowError("INBOUND_START_UNIT_MISSING", `连续向上搜索到顶部仍未找到可分段读取的 ${userUnitKey}`, { user_unit_key: userUnitKey });
    }
    if (transitions >= maxWindowTransitions) throw windowError("INBOUND_RANGE_SCROLL_LIMIT", "起点搜索超过窗口转换上限");
    const moved = await view.scrollBy(-1);
    transitions += 1;
    previousSearch = current;
    current = await readDomWindow(view);
    if (moved.before === moved.after) {
      throw windowError("INBOUND_START_SEARCH_NO_PROGRESS", "向上滚动无位移且尚未到顶部");
    }
  }

  const collector = createInboundRangeCollector(userUnitKey, { expectedUnitKeys });
  let collectionState = collector.ingest(current.units, { atBottom: current.at_bottom, scrollable: current.scrollable });
  while (!collectionState.complete) {
    if (current.at_bottom) throw windowError("INBOUND_RANGE_INCOMPLETE", "已到底但未形成完整目标区间");
    if (transitions >= maxWindowTransitions) throw windowError("INBOUND_RANGE_SCROLL_LIMIT", "区间采集超过窗口转换上限");
    const moved = await view.scrollBy(1);
    transitions += 1;
    current = await readDomWindow(view);
    if (moved.before === moved.after) {
      throw windowError("INBOUND_RANGE_SCROLL_NO_PROGRESS", "向下滚动无位移且尚未到终点");
    }
    collectionState = collector.ingest(current.units, { atBottom: current.at_bottom, scrollable: current.scrollable });
  }

  const materialized = collector.build();
  const selected = selectInboundReply(materialized.units, userUnitKey, { maxAssistantUnits });
  const visibleUnits = current.units.filter((unit) => unit.visible);
  const tail = visibleUnits.length > 0 ? visibleUnits[visibleUnits.length - 1] : null;
  return {
    ...selected,
    range_proof: { ...materialized.range_proof, start_search_windows: searchProof, window_transitions: transitions },
    read_started_at: new Date(readStartedAt).toISOString(),
    read_finished_at: new Date(view.now()).toISOString(),
    rendered_unit_keys: current.units.map((unit) => unit.key),
    tail: tail ? { key: tail.key, role: tail.role, assistantUuid: tail.assistantUuid } : null,
  };
}
