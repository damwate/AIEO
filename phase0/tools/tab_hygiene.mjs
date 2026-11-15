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
//   - 新会话派单：候选=chatgpt.com 页；优先会话页（/c/）中最近创建者，其次
//     主页；多候选取末位；零候选 → null。
// 去重规则（维护清理）：按会话 UUID 分组，每组保留末位（最近创建），其余关闭；
//   无 UUID 的 chatgpt 页（主页/新 tab）保留末位一个；非 chatgpt 页不进计划。

const CHATGPT_HOST_RE = /(^|\.)chatgpt\.com/i;
const CONV_RE = /\/c\/([0-9a-fA-F-]{36})/;

/** 页描述：{ index, url, createdAt? }（index=调用方数组下位；createdAt 可选 ISO/epoch，缺省用 index 序） */
export function describePages(pages) {
  return pages.map((p, index) => {
    const url = String(p.url || "");
    const m = url.match(CONV_RE);
    return {
      index,
      url,
      isChatGpt: CHATGPT_HOST_RE.test(url) || url === "about:blank" || url === "",
      conversationUuid: m ? m[1].toLowerCase() : null,
      seq: p.createdAt ? Number(p.createdAt) || 0 : index,
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
  const convPages = newestFirst(chatgpt.filter((d) => d.conversationUuid));
  if (convPages[0]) return convPages[0];
  const home = newestFirst(chatgpt.filter((d) => !d.conversationUuid));
  return home[0] || null;
}

/** 维护去重计划：{ keep: [index], close: [index] }——每会话留最近创建一页。 */
export function dedupePlan(descs) {
  const chatgpt = descs.filter((d) => d.isChatGpt);
  const keep = [];
  const close = [];
  const groups = new Map();
  for (const d of newestFirst(chatgpt)) {
    const key = d.conversationUuid || "(home)";
    if (!groups.has(key)) {
      groups.set(key, true);
      keep.push(d.index);
    } else {
      close.push(d.index);
    }
  }
  return { keep, close };
}
