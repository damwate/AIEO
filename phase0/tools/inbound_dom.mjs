// ChatGPT/仿真页共用的真实 DOM 窗口采集逻辑。
// 本文件只定义页面操作，不声明证据来源；调用方必须区分真实 ChatGPT 与本地仿真 DOM。

import {
  createInboundRangeCollector,
  proveAdjacentWindowOverlap,
  selectInboundReply,
} from "./inbound_reply.mjs";

export async function readTailUnit(page) {
  return page.evaluate(() => {
    const units = Array.from(document.querySelectorAll("[data-content-search-unit-key]")).filter(
      (el) => el.offsetParent !== null || el.getClientRects().length > 0);
    if (!units.length) return null;
    const last = units[units.length - 1];
    const key = last.getAttribute("data-content-search-unit-key") || "";
    const role = key.split(":").pop();
    let assistantUuid = null;
    if (role === "assistant") {
      const dils = Array.from(last.querySelectorAll("[data-dil-response][data-dil-message-id]"));
      if (dils.length === 1) {
        const id = dils[0].getAttribute("data-dil-message-id") || "";
        assistantUuid = id.length > 0 ? id : null;
      }
    }
    return { role, key, assistantUuid };
  });
}

// 完整读取当前 DOM 渲染集合，不用文本 marker，也不只取尾部或可视片段。
export async function readDomUnits(page) {
  return page.evaluate(() => Array.from(document.querySelectorAll("[data-content-search-unit-key]")).map((el) => {
    const key = el.getAttribute("data-content-search-unit-key") || "";
    const role = key.split(":").pop();
    const dils = Array.from(el.querySelectorAll("[data-dil-response][data-dil-message-id]"));
    let assistantUuid = null;
    if (role === "assistant" && dils.length === 1) {
      const id = dils[0].getAttribute("data-dil-message-id") || "";
      assistantUuid = id.length > 0 ? id : null;
    }
    return {
      key,
      role,
      text: el.innerText ?? "",
      assistantUuid,
      visible: el.offsetParent !== null || el.getClientRects().length > 0,
    };
  }));
}

export async function readDomWindow(page) {
  const units = await readDomUnits(page);
  const scroll = await page.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll("[data-content-search-unit-key]"));
    const anchor = candidates.find((el) => el.offsetParent !== null || el.getClientRects().length > 0) || candidates[0];
    let scroller = anchor?.parentElement ?? null;
    while (scroller && scroller !== document.body) {
      const style = getComputedStyle(scroller);
      if (/(auto|scroll|overlay)/.test(style.overflowY) && scroller.scrollHeight > scroller.clientHeight) break;
      scroller = scroller.parentElement;
    }
    const target = scroller && scroller !== document.body ? scroller : document.scrollingElement;
    if (!target) return { at_top: true, at_bottom: true, scrollable: false, scroll_top: 0, scroll_height: 0, client_height: 0 };
    return {
      at_top: target.scrollTop <= 1,
      at_bottom: target.scrollTop + target.clientHeight >= target.scrollHeight - 2,
      scrollable: target.scrollHeight > target.clientHeight + 2,
      scroll_top: target.scrollTop,
      scroll_height: target.scrollHeight,
      client_height: target.clientHeight,
    };
  });
  return { units, ...scroll };
}

export async function scrollDomWindow(page, direction) {
  const result = await page.evaluate(({ direction }) => {
    const candidates = Array.from(document.querySelectorAll("[data-content-search-unit-key]"));
    const anchor = candidates.find((el) => el.offsetParent !== null || el.getClientRects().length > 0) || candidates[0];
    let scroller = anchor?.parentElement ?? null;
    while (scroller && scroller !== document.body) {
      const style = getComputedStyle(scroller);
      if (/(auto|scroll|overlay)/.test(style.overflowY) && scroller.scrollHeight > scroller.clientHeight) break;
      scroller = scroller.parentElement;
    }
    const target = scroller && scroller !== document.body ? scroller : document.scrollingElement;
    if (!target) return { before: 0, after: 0 };
    const before = target.scrollTop;
    const delta = Math.max(200, target.clientHeight * 0.65) * direction;
    target.scrollTop = Math.max(0, Math.min(target.scrollHeight - target.clientHeight, before + delta));
    return { before, after: target.scrollTop };
  }, { direction });
  await page.waitForTimeout(250);
  return result;
}

function findStartIndex(windowUnits, userUnitKey) {
  return windowUnits.findIndex((unit) => unit.key === userUnitKey && unit.role === "user");
}

// 两段式实体化：先向上逐窗定位起点，再向下逐窗收集至下一 user 或真实底部。
// expectedUnitKeys 必须来自独立于渲染 DOM 的逻辑序列（仅测试/已有可信清单可提供）。
// 可滚动虚拟列表没有该独立序列时，重叠证明不足以排除持续遗漏，build() 将 fail-closed。
export async function readReplySnapshot(page, userUnitKey, { expectedUnitKeys = null } = {}) {
  const readStartedAt = Date.now();
  const maxWindowTransitions = Number(process.env.AIEO_GPT_CONTROLLER_MAX_RANGE_SCROLLS || 200);
  let current = await readDomWindow(page);
  if (current.units.length === 0) throw new Error("INBOUND_WINDOW_EMPTY: 页面没有已渲染 unit");
  let previousSearch = null;
  const searchProof = [];
  let transitions = 0;

  while (true) {
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
      throw new Error(`INBOUND_START_UNIT_MISSING: 连续向上搜索到顶部仍未找到可分段读取的 ${userUnitKey}`);
    }
    if (transitions >= maxWindowTransitions) throw new Error("INBOUND_RANGE_SCROLL_LIMIT: 起点搜索超过窗口转换上限");
    const moved = await scrollDomWindow(page, -1);
    transitions += 1;
    previousSearch = current;
    current = await readDomWindow(page);
    if (moved.before === moved.after) throw new Error("INBOUND_START_SEARCH_NO_PROGRESS: 向上滚动无位移且尚未到顶部");
  }

  const collector = createInboundRangeCollector(userUnitKey, { expectedUnitKeys });
  let collectionState = collector.ingest(current.units, { atBottom: current.at_bottom, scrollable: current.scrollable });
  while (!collectionState.complete) {
    if (current.at_bottom) throw new Error("INBOUND_RANGE_INCOMPLETE: 已到底但未形成完整目标区间");
    if (transitions >= maxWindowTransitions) throw new Error("INBOUND_RANGE_SCROLL_LIMIT: 区间采集超过窗口转换上限");
    const moved = await scrollDomWindow(page, 1);
    transitions += 1;
    current = await readDomWindow(page);
    if (moved.before === moved.after) throw new Error("INBOUND_RANGE_SCROLL_NO_PROGRESS: 向下滚动无位移且尚未到终点");
    collectionState = collector.ingest(current.units, { atBottom: current.at_bottom, scrollable: current.scrollable });
  }

  const materialized = collector.build();
  const selected = selectInboundReply(materialized.units, userUnitKey);
  const visibleUnits = current.units.filter((unit) => unit.visible);
  const tail = visibleUnits.length > 0 ? visibleUnits[visibleUnits.length - 1] : null;
  return {
    ...selected,
    range_proof: { ...materialized.range_proof, start_search_windows: searchProof, window_transitions: transitions },
    read_started_at: new Date(readStartedAt).toISOString(),
    read_finished_at: new Date().toISOString(),
    rendered_unit_keys: current.units.map((unit) => unit.key),
    tail: tail ? { key: tail.key, role: tail.role, assistantUuid: tail.assistantUuid } : null,
  };
}
