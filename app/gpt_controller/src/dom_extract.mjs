// M2 DOM 契约提取（ChatGPT 网页 / 本地仿真 DOM 共用同一份实现，DEC-002）。
//
// 本文件的每个函数必须保持"自包含"（不引用模块级变量），因为它们会以
// `page.evaluate(fn.toString())` 形式在真实浏览器上下文执行，也会直接作用于
// 测试夹具的 mini-DOM 文档对象。禁止在这里 import 任何东西。
//
// DOM 契约元素：
//   - unit 锚点：[data-content-search-unit-key]，key 形如 "<id>:<role>"，role 取冒号后缀；
//   - DIL UUID：unit 内 [data-dil-response][data-dil-message-id]（assistant 身份，唯一时才采信）；
//   - composer：aria-label 询问 ChatGPT / Ask ChatGPT 或 #prompt-textarea；
//   - 停止按钮：aria-label 停止 / Stop 或 data-testid="stop-button"（可见且非零尺寸才算）。

// 完整读取当前 DOM 渲染集合；text 是未经清理的原始 innerText，不做空白折叠。
export function extractUnitsDocument(doc) {
  const elements = Array.from(doc.querySelectorAll("[data-content-search-unit-key]"));
  return elements.map((el) => {
    const key = el.getAttribute("data-content-search-unit-key") || "";
    const role = key.split(":").pop();
    const dils = Array.from(el.querySelectorAll("[data-dil-response][data-dil-message-id]"));
    let assistantUuid = null;
    if (role === "assistant" && dils.length === 1) {
      const id = dils[0].getAttribute("data-dil-message-id") || "";
      assistantUuid = id.length > 0 ? id : null;
    }
    const visible = el.offsetParent !== null || (el.getClientRects && el.getClientRects().length > 0);
    return {
      key,
      role,
      text: el.innerText ?? "",
      assistantUuid,
      visible,
    };
  });
}

// 只取可视 unit 的尾部（发送双验与完成判定用，不取不可见虚拟残留）。
export function readTailUnitDocument(doc) {
  const units = extractUnitsDocument(doc).filter((unit) => unit.visible);
  if (!units.length) return null;
  const last = units[units.length - 1];
  return { role: last.role, key: last.key, assistantUuid: last.assistantUuid };
}

// 停止按钮可见性：可见（渲染且非零尺寸）才返回 true。
export function stopButtonVisibleDocument(doc) {
  const candidates = doc.querySelectorAll(
    'button[aria-label="停止"], button[aria-label="Stop"], button[data-testid="stop-button"], form button[aria-label*="停止"], form button[aria-label*="Stop"]');
  for (const el of candidates) {
    if (el.offsetParent !== null || (el.getClientRects && el.getClientRects().length > 0)) {
      const r = typeof el.getBoundingClientRect === "function" ? el.getBoundingClientRect() : null;
      if (!r || (r.width > 0 && r.height > 0)) return true;
    }
  }
  return false;
}

// composer 探测：存在且可取文本。
export function composerProbeDocument(doc) {
  const candidates = doc.querySelectorAll(
    '[aria-label="询问 ChatGPT"], [aria-label="Ask ChatGPT"], #prompt-textarea');
  for (const el of candidates) {
    const visible = el.offsetParent !== null || (el.getClientRects && el.getClientRects().length > 0);
    if (visible) return { present: true, text: el.innerText ?? "" };
  }
  return { present: false, text: null };
}

export function bodyTextDocument(doc) {
  return (doc.body && doc.body.innerText) || "";
}

// 上下文上限横幅检测（rotateIfContextLimit 触发源；phase0 实测文案）。
export const CONTEXT_LIMIT_MARKER = "上下文窗口已达上限";

export function contextLimitDocument(doc) {
  return bodyTextDocument(doc).includes(CONTEXT_LIMIT_MARKER);
}

// 滚动容器探测与状态（仅真实浏览器路径使用；夹具用自己的窗口模型）。
export function scrollStateDocument(doc) {
  const candidates = Array.from(doc.querySelectorAll("[data-content-search-unit-key]"));
  const anchor = candidates.find((el) => el.offsetParent !== null || el.getClientRects().length > 0) || candidates[0];
  let scroller = anchor?.parentElement ?? null;
  while (scroller && scroller !== doc.body) {
    const style = getComputedStyle(scroller);
    if (/(auto|scroll|overlay)/.test(style.overflowY) && scroller.scrollHeight > scroller.clientHeight) break;
    scroller = scroller.parentElement;
  }
  const target = scroller && scroller !== doc.body ? scroller : doc.scrollingElement;
  if (!target) return { at_top: true, at_bottom: true, scrollable: false, scroll_top: 0, scroll_height: 0, client_height: 0 };
  return {
    at_top: target.scrollTop <= 1,
    at_bottom: target.scrollTop + target.clientHeight >= target.scrollHeight - 2,
    scrollable: target.scrollHeight > target.clientHeight + 2,
    scroll_top: target.scrollTop,
    scroll_height: target.scrollHeight,
    client_height: target.clientHeight,
  };
}

export function scrollByDocument(doc, direction) {
  const candidates = Array.from(doc.querySelectorAll("[data-content-search-unit-key]"));
  const anchor = candidates.find((el) => el.offsetParent !== null || el.getClientRects().length > 0) || candidates[0];
  let scroller = anchor?.parentElement ?? null;
  while (scroller && scroller !== doc.body) {
    const style = getComputedStyle(scroller);
    if (/(auto|scroll|overlay)/.test(style.overflowY) && scroller.scrollHeight > scroller.clientHeight) break;
    scroller = scroller.parentElement;
  }
  const target = scroller && scroller !== doc.body ? scroller : doc.scrollingElement;
  if (!target) return { before: 0, after: 0 };
  const before = target.scrollTop;
  const delta = Math.max(200, target.clientHeight * 0.65) * direction;
  target.scrollTop = Math.max(0, Math.min(target.scrollHeight - target.clientHeight, before + delta));
  return { before, after: target.scrollTop };
}
