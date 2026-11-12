// 测试夹具：受约束 HTML 的 mini-DOM（仅供本地仿真测试使用，不是生产代码）。
// 只需支撑 src/dom_extract.mjs 共享提取函数所用到的 DOM API 子集：
//   querySelectorAll（有限选择器）、getAttribute、innerText、offsetParent、
//   getClientRects、getBoundingClientRect、parentElement、body/scrollingElement。
// 夹具 HTML 由本仓库自己编写（fixtures/chatgpt-sim.html），保持简单良构，
// 解析器不面向任意网页，只面向该契约子集。

const BLOCK_TAGS = new Set(["div", "p", "form", "section", "textarea"]);

class MiniNode {
  constructor(tagName, attributes = {}) {
    this.type = "element";
    this.tagName = tagName.toLowerCase();
    this.attributes = attributes;
    this.childNodes = []; // {type:'text', value} 或 MiniNode
    this.parentNode = null;
    this.id = attributes.id ?? null;
  }

  appendChild(node) {
    node.parentNode = this;
    this.childNodes.push(node);
    return node;
  }

  get parentElement() {
    return this.parentNode && this.parentNode.tagName ? this.parentNode : null;
  }

  get hidden() {
    if (this.attributes.hidden !== undefined) return true;
    const style = this.attributes.style ?? "";
    if (/display\s*:\s*none/i.test(style)) return true;
    return this.parentElement ? this.parentElement.hidden : false;
  }

  // 渲染近似：可见元素给出非空 client rects；隐藏元素为空。
  getClientRects() {
    return this.hidden ? [] : [{ width: 120, height: 24 }];
  }

  getBoundingClientRect() {
    return this.hidden ? { width: 0, height: 0 } : { width: 120, height: 24 };
  }

  get offsetParent() {
    return this.hidden ? null : (this.parentElement ?? "body");
  }

  get textContent() {
    return this.childNodes.map((child) => (child.type === "text" ? child.value : child.textContent)).join("");
  }

  get innerText() {
    // 近似真实 innerText：隐藏元素不产生渲染文本（display:none 的横幅/按钮不可见）；
    // 块级元素之间补换行；空白按原样保留。
    if (this.hidden) return "";
    const parts = [];
    for (const child of this.childNodes) {
      if (child.type === "text") {
        parts.push(child.value);
      } else if (child.hidden) {
        continue;
      } else if (BLOCK_TAGS.has(child.tagName)) {
        parts.push(`\n${child.innerText}\n`);
      } else {
        parts.push(child.innerText);
      }
    }
    return parts.join("").replace(/^\n+|\n+$/g, "");
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }

  matches(selector) {
    // 支持的 compound：可选 tag、可选 #id、任意 [attr]、[attr="v"]、[attr*=v]。
    const tagMatch = selector.match(/^[a-z][a-z0-9-]*/i);
    if (tagMatch && tagMatch[0].toLowerCase() !== this.tagName) return false;
    const attrPattern = /\[([a-z-]+)(?:="([^"]*)"|\*="([^"]*)")?\]/gi;
    let match;
    while ((match = attrPattern.exec(selector)) !== null) {
      const [, name, equals, contains] = match;
      const value = this.attributes[name];
      if (value === undefined) return false;
      if (equals !== undefined && value !== equals) return false;
      if (contains !== undefined && !value.includes(contains)) return false;
    }
    const idMatch = selector.match(/#([A-Za-z0-9_-]+)/);
    if (idMatch && this.id !== idMatch[1]) return false;
    return true;
  }

  querySelectorAll(selector) {
    const results = [];
    const groups = selector.split(",").map((s) => s.trim()).filter(Boolean);
    // 后代组合按空白切分，但不得切进带引号的属性值（如 [aria-label="Ask ChatGPT"]）。
    const splitOutsideQuotes = (text) => text.split(/\s+(?=(?:[^"]*"[^"]*")*[^"]*$)/).filter(Boolean);
    const collect = (node, compound) => {
      for (const child of node.childNodes) {
        if (child.type !== "element") continue;
        if (child.matches(compound)) results.push(child);
        collect(child, compound);
      }
    };
    for (const group of groups) {
      const parts = splitOutsideQuotes(group); // 仅支持一级后代组合（如 "form button[...]"）
      if (parts.length === 1) {
        collect(this, parts[0]);
      } else if (parts.length === 2) {
        for (const child of this.childNodes) {
          if (child.type === "element" && child.matches(parts[0])) {
            collect(child, parts[1]);
          }
        }
      } else {
        throw new Error(`mini-dom 不支持的选择器: ${group}`);
      }
    }
    return results;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  // 直接修改子节点（仿真发送/回复注入使用）。
  setText(value) {
    this.childNodes = [{ type: "text", value }];
  }

  remove() {
    if (!this.parentNode) return;
    const index = this.parentNode.childNodes.indexOf(this);
    if (index >= 0) this.parentNode.childNodes.splice(index, 1);
    this.parentNode = null;
  }
}

export function decodeEntities(text) {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

// 解析受约束 HTML（标签不跨行、属性用双引号、无注释/CDATA/脚本；注释整体剔除）。
export function parseMiniDom(html) {
  const source = String(html).replace(/<!--[\s\S]*?-->/g, " ");
  const documentNode = new MiniNode("#document");
  const body = new MiniNode("body");
  documentNode.appendChild(body);
  const stack = [body];
  const tagPattern = /<\s*(\/)?\s*([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[\w-]+(?:="[^"]*")?)*)\s*(\/)?>|([^<]+)/g;
  let match;
  while ((match = tagPattern.exec(source)) !== null) {
    const [, closing, tagName, attrText, selfClosing, text] = match;
    if (text !== undefined) {
      const value = decodeEntities(text);
      if (value.trim().length > 0) {
        const current = stack[stack.length - 1];
        current.appendChild({ type: "text", value });
      }
      continue;
    }
    const lower = tagName.toLowerCase();
    if (closing) {
      const index = stack.map((n) => n.tagName).lastIndexOf(lower);
      if (index > 0) stack.length = index; // pop 到匹配标签
      continue;
    }
    const attributes = {};
    const attrPattern = /([\w-]+)(?:="([^"]*)")?/g;
    let attrMatch;
    while ((attrMatch = attrPattern.exec(attrText ?? "")) !== null) {
      attributes[attrMatch[1]] = attrMatch[2] ?? "";
    }
    const node = new MiniNode(lower, attributes);
    stack[stack.length - 1].appendChild(node);
    if (!selfClosing && !["br", "img", "input", "meta", "link"].includes(lower)) {
      stack.push(node);
    }
  }
  const doc = {
    nodeType: 9,
    body,
    documentElement: body,
    scrollingElement: body,
    querySelectorAll: (selector) => body.querySelectorAll(selector),
    querySelector: (selector) => body.querySelector(selector),
  };
  return doc;
}

export { MiniNode };
