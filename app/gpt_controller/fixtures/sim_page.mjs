// 测试夹具：ChatGPT 仿真页（本地 DOM fixture，不是 ChatGPT；边界如实标注）。
// 实现 src/dom_view.mjs 的 ChatgptDomView 接口，供 runDispatch/采集/发送双验/
// 生成等待等全部 M2 逻辑在无浏览器、无网络的条件下走真实代码路径。
//
// 虚拟列表仿真：以"真实虚拟化"方式工作——窗口外的 unit 从 DOM 中移除（不是隐藏），
// 滚动后按 DOM 顺序重新挂载，与真实页面的窗口裁切行为一致。
// 时间仿真：schedule 事件队列 + 虚拟时钟，sleep(ms) 推进虚拟时间并触发到期事件。

import { MiniNode, parseMiniDom } from "./mini_dom.mjs";
import {
  composerProbeDocument,
  extractUnitsDocument,
  readTailUnitDocument,
  stopButtonVisibleDocument,
} from "../src/dom_extract.mjs";

export const UNIT_HEIGHT_PX = 100;

export class FixtureChatgptPage {
  constructor({
    html,
    pages = {},
    viewportUnits = 4,
    clockStart = 0,
    conversationUrl = null,
    onSend = null,
  } = {}) {
    this.pages = pages; // url → html：navigate 时切换页面（轮换仿真用）
    this.doc = parseMiniDom(html);
    this.unitHeight = UNIT_HEIGHT_PX;
    this.viewportUnits = viewportUnits;
    this.scrollTop = 0;
    this.virtualNow = clockStart;
    this.schedule = [];
    this.conversationUrl = conversationUrl;
    this.onSend = onSend; // ({ text, page }) => void：Enter 后的页面行为脚本
    this.composerValue = "";
    // 全量 unit 集合（含当前不在 DOM 中的窗口外 unit）；order 决定文档顺序。
    this.allUnits = [...this.doc.querySelectorAll("[data-content-search-unit-key]")];
    this.allUnits.forEach((unit, index) => { unit.order = index + 1; });
    this.refresh();
  }

  // ---------- 虚拟化窗口 ----------
  refresh() {
    const parent = this.doc.querySelector("#thread") ?? this.doc.body;
    const windowStart = Math.floor(this.scrollTop / this.unitHeight);
    const windowEnd = windowStart + this.viewportUnits; // [start, end)
    const ordered = [...this.allUnits].sort((a, b) => a.order - b.order);
    for (const unit of ordered) unit.remove();
    const inWindow = ordered.filter((_, index) => index >= windowStart && index < windowEnd);
    for (const unit of inWindow) parent.appendChild(unit);
    return inWindow;
  }

  scrollGeometry() {
    const scrollHeight = Math.max(this.allUnits.length, 1) * this.unitHeight;
    const clientHeight = this.viewportUnits * this.unitHeight;
    return { scrollHeight, clientHeight };
  }

  scrollToBottom() {
    const { scrollHeight, clientHeight } = this.scrollGeometry();
    this.scrollTop = Math.max(0, scrollHeight - clientHeight);
    this.refresh();
  }

  // ---------- ChatgptDomView 接口 ----------
  async evaluateDocument(documentFunction) {
    return documentFunction(this.doc);
  }

  async listUnits() {
    return extractUnitsDocument(this.doc);
  }

  async readTailUnit() {
    return readTailUnitDocument(this.doc);
  }

  async scrollState() {
    const { scrollHeight, clientHeight } = this.scrollGeometry();
    return {
      at_top: this.scrollTop <= 1,
      at_bottom: this.scrollTop + clientHeight >= scrollHeight - 2,
      scrollable: scrollHeight > clientHeight + 2,
      scroll_top: this.scrollTop,
      scroll_height: scrollHeight,
      client_height: clientHeight,
    };
  }

  async scrollBy(direction) {
    const { scrollHeight, clientHeight } = this.scrollGeometry();
    const before = this.scrollTop;
    const delta = Math.max(200, clientHeight * 0.65) * direction;
    this.scrollTop = Math.max(0, Math.min(scrollHeight - clientHeight, before + delta));
    this.refresh();
    return { before, after: this.scrollTop };
  }

  async stopButtonVisible() {
    return stopButtonVisibleDocument(this.doc);
  }

  async bodyText() {
    return this.doc.body.innerText;
  }

  async composerText() {
    const probe = composerProbeDocument(this.doc);
    return probe.present ? probe.text : null;
  }

  async focusComposer() {
    // 仿真页 composer 恒定就绪，无需真实 focus。
  }

  async insertComposerText(text) {
    this.composerValue = text;
    const composer = this.doc.querySelector('[aria-label="Ask ChatGPT"]');
    if (composer) composer.setText(text);
  }

  async pressEnter() {
    const text = this.composerValue;
    this.composerValue = "";
    const composer = this.doc.querySelector('[aria-label="Ask ChatGPT"]');
    if (composer) composer.setText("");
    if (this.onSend) this.onSend({ text, page: this });
  }

  loadHtml(html) {
    this.doc = parseMiniDom(html);
    this.scrollTop = 0;
    this.composerValue = "";
    this.schedule = []; // 页面重载后原页面的定时脚本不再生效
    this.allUnits = [...this.doc.querySelectorAll("[data-content-search-unit-key]")];
    this.allUnits.forEach((unit, index) => { unit.order = index + 1; });
    this.refresh();
  }

  async navigate(url) {
    if (this.pages[url]) this.loadHtml(this.pages[url]);
    this.navigatedTo = url;
  }

  async sleep(ms) {
    this.advance(ms);
  }

  url() {
    return this.conversationUrl;
  }

  now() {
    return this.virtualNow;
  }

  // ---------- 仿真控制（测试专用） ----------
  at(delayMs, fn) {
    this.schedule.push({ at: this.virtualNow + delayMs, fn });
    this.schedule.sort((a, b) => a.at - b.at);
  }

  advance(ms) {
    const target = this.virtualNow + ms;
    for (;;) {
      const due = this.schedule.find((event) => event.at <= target);
      if (!due) break;
      this.schedule = this.schedule.filter((event) => event !== due);
      this.virtualNow = Math.max(this.virtualNow, due.at);
      due.fn(this);
    }
    this.virtualNow = target;
    this.refresh();
  }

  setGenerating(generating) {
    const stop = this.doc.querySelector('[data-testid="stop-button"]');
    if (stop) {
      stop.attributes.style = generating ? "" : "display:none";
    }
  }

  setContextLimitBanner(visible) {
    const banner = this.doc.querySelector("#context-limit-banner");
    if (banner) banner.attributes.style = visible ? "" : "display:none";
  }

  // 追加 unit（key 格式 "<id>:<role>"；assistant 需要非空 data-dil-message-id）。
  appendUnit({ key, role, text, assistantUuid = null }) {
    const parent = this.doc.querySelector("#thread") ?? this.doc.body;
    const unit = new MiniNode("div", { "data-content-search-unit-key": key });
    if (role === "assistant" && assistantUuid) {
      const dil = new MiniNode("div", { "data-dil-response": "", "data-dil-message-id": assistantUuid });
      dil.appendChild({ type: "text", value: text });
      unit.appendChild(dil);
    } else {
      unit.appendChild({ type: "text", value: text });
    }
    unit.order = this.allUnits.length + 1;
    this.allUnits.push(unit);
    parent.appendChild(unit);
    this.refresh();
    return unit;
  }

  // 修改既有 assistant unit 的原文（两次读取不一致负例）。
  mutateUnitText(key, newText) {
    const unit = this.allUnits.find((candidate) => candidate.getAttribute("data-content-search-unit-key") === key);
    if (!unit) throw new Error(`fixture unit 不存在: ${key}`);
    const dil = unit.querySelectorAll("[data-dil-response][data-dil-message-id]")[0];
    if (dil) dil.setText(newText);
    else unit.setText(newText);
    this.refresh();
  }
}
