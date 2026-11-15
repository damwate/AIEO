// Chrome tab 生命周期卫生共享件（b-20261116-tab-cleanup，DEC-063 处置②）。
//
// 职责：tab 枚举描述 / 消歧选择 / 每会话去重计划。纯函数核心接收"页描述数组"，
// 不触碰浏览器；调用方（gpt_dispatch / recoll 模板 / tab_cleanup 维护脚本）负责
// 实际枚举（ctx.pages() 或 CDP /json）与执行关闭。
//
// 零语义变更红线（task-brief §2）：本件只管理页面生命周期选择，不改发送双验/
// 禁重发/归属校验/fail-closed 任何逻辑；返回 null 表示"调用方按既有规则新建页"。
//
// 消歧规则（DEC-060"后续派单/补采须先做 tab 消歧（page-recovery 语义）"落点）：
//   - 指定会话（recoll/续会话）：只认 URL 含 /c/<uuid> 的页；多命中取数组末位
//     （playwright ctx.pages() 与 CDP /json 均按创建序返回，末位=最近创建）；
//     零命中 → null（由调用方决定 newPage）。
//   - 新会话派单：返回第一个 chatgpt.com 页（数组序）——与既有 attachPage 行为
//     语义一致（--new-session 复用页会先 goto CHATGPT_HOME 再写 composer，无落错
//     会话风险）；零候选 → null。本件不改此路径选择结果，只提供同一判定的
//     显式出口供落档审计。
// 去重规则（维护清理）：按会话 UUID 分组，每组保留末位（最近创建），其余关闭；
//   无 UUID 的 chatgpt 页（主页/新 tab）保留末位一个；非 chatgpt 页不进计划。

const CONV_RE = /\/c\/([0-9a-fA-F-]{36})/;

/** 页描述：{ index, url, createdAt?, generating?, owned? }
 *  index=调用方数组下位；createdAt 可选 ISO/epoch，缺省用 index 序；
 *  generating=该页正在生成回复（停止按钮可见等，由调用方探测后标注）——永不进关闭计划；
 *  owned=调用方安全门槛已确认可关——运行结束清理语义=created-pages 注册表成员（P1-05）；
 *  维护模式语义=逐页安全门槛通过（P1-04）。未确权页永不进关闭计划（fail-closed）。 */
export function describePages(pages) {
  return pages.map((p, index) => {
    const url = String(p.url || "");
    const m = url.match(CONV_RE);
    return {
      index,
      url,
      // 与既有 attachPage 判定逐字一致：url().includes("chatgpt.com")（零语义变更红线）
      isChatGpt: url.includes("chatgpt.com"),
      conversationUuid: m ? m[1].toLowerCase() : null,
      seq: p.createdAt ? Number(p.createdAt) || 0 : index,
      generating: p.generating === true,
      owned: p.owned === true,
    };
  });
}

function newestFirst(descs) {
  return [...descs].sort((a, b) => (b.seq - a.seq) || (b.index - a.index));
}

/** 消歧选择：返回应复用的页描述或 null（零候选/指定会话未命中）。 */
export function pickChatGptPage(descs, { conversationUuid = null } = {}) {
  const chatgpt = descs.filter((d) => d.isChatGpt);
  if (conversationUuid) {
    const want = String(conversationUuid).toLowerCase();
    const matched = newestFirst(chatgpt.filter((d) => d.conversationUuid === want));
    return matched[0] || null;
  }
  // 新会话：与既有 attachPage 语义一致——第一个 chatgpt.com 页（数组序）。
  return chatgpt[0] || null;
}

/** 失败路径清理决策（gpt_dispatch catch 分叉的可测纯函数，S4-R1 P1-01）：
 *  sendAttempted=true（Enter 已按下）→"preserve_scene"（UNCERTAIN/生成中现场保留，禁关页）；
 *  sendAttempted=false（发送前任何失败，无发送证据）→"close_created_pages"（仅关自建页）。 */
export function cleanupDecision({ sendAttempted }) {
  return sendAttempted ? "preserve_scene" : "close_created_pages";
}

/** 维护去重计划：{ keep: [index], close: [index], skippedGenerating: [index], skippedNotOwned: [index] }
 *  每会话留最近创建一页；关闭候选仅限"非生成中且 owned 确权"的重复页——
 *  生成中页（P2-02 误关保护）与未确权页（P1-05 归属隔离）一律降级到对应 skipped 列表。 */
export function dedupePlan(descs) {
  const chatgpt = descs.filter((d) => d.isChatGpt);
  const keep = [];
  const close = [];
  const skippedGenerating = [];
  const skippedNotOwned = [];
  const groups = new Map();
  for (const d of newestFirst(chatgpt)) {
    const key = d.conversationUuid || "(home)";
    if (!groups.has(key)) {
      groups.set(key, true);
      keep.push(d.index);
      continue;
    }
    if (d.generating) skippedGenerating.push(d.index);
    else if (!d.owned) skippedNotOwned.push(d.index);
    else close.push(d.index);
  }
  return { keep, close, skippedGenerating, skippedNotOwned };
}
