// M2 DOM 契约自检（DEC-002：内置契约自检、禁止盲发）。
// 自检项：unit 锚点计数、composer 探测、停止按钮探测、body 文本可读。
// 自检失败 = DOM 改版或页面异常，控制器拒绝发送，转人工接管边界（PROVIDER-0004 语义）。

import {
  bodyTextDocument,
  composerProbeDocument,
  extractUnitsDocument,
  stopButtonVisibleDocument,
} from "./dom_extract.mjs";

// 在页面上下文执行（自包含函数）。
export function domContractProbeDocument(doc) {
  const units = extractUnitsDocument(doc);
  const composer = composerProbeDocument(doc);
  return {
    unit_anchor_count: units.length,
    visible_unit_count: units.filter((unit) => unit.visible).length,
    composer_present: composer.present,
    stop_button_probe_ok: typeof stopButtonVisibleDocument(doc) === "boolean",
    body_text_length: bodyTextDocument(doc).length,
  };
}

/**
 * 契约自检。requireUnits=true（已有会话派单）时要求至少渲染一个 unit；
 * 新建空白会话用 requireUnits=false。返回 { ok, checks }，任一失败 ok=false。
 */
export async function checkDomContract(view, { requireUnits = true } = {}) {
  const probe = await view.evaluateDocument(domContractProbeDocument);
  const checks = {
    unit_anchor_count: probe.unit_anchor_count,
    visible_unit_count: probe.visible_unit_count,
    composer_present: probe.composer_present === true,
    stop_button_probe_ok: probe.stop_button_probe_ok === true,
    body_text_readable: probe.body_text_length > 0,
    units_present_when_required: requireUnits ? probe.unit_anchor_count > 0 : true,
  };
  return { ok: Object.values(checks).every(Boolean), checks };
}
