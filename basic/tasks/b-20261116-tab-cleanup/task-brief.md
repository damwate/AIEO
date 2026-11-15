# 任务书：Chrome tab 泄漏清理（tab-cleanup）

- 任务ID：b-20261116-tab-cleanup
- 日期：2026-11-16
- **版本选型：**
  - 选定版本：Basic
  - 任务等级：S2（纪要 §五：工具链代码类；Basic/Standard 边界按风险定）
  - 选型理由：M2 派单工具链小步修复（tab 生命周期卫生），无平台契约/状态机变更，无外部行为语义变更；风险=改坏派单链（以零语义变更约束+测试矩阵对冲），Basic 足够
  - 批准人/日期：用户 2026-11-16 开工指令明列"Chrome tab 泄漏小任务"（DEC-063 处置②），L-020 节点授权推进

## 需求原文

见 `requirement.md`（delivery 后续建议①＋DEC-060 pending-issues＋用户开工指令，原文存档）。

## 执行者理解（与原文分开，便于对账）

1. **缺陷事实（两处，读码核实）：**
   - `phase0/tools/gpt_dispatch.mjs:127`——`ctx.pages().find(p => p.url().includes("chatgpt.com")) || ctx.pages()[0] || await ctx.newPage()`：多 tab 时任取第一个 chatgpt 页（无消歧规则）；新建页运行结束不关闭（泄漏积累，DEC-060 实测 4 tab）。
   - `phase1/tools/review_leg_recoll_template.mjs:112-114`——按 CONV_UUID 找页，找不到即 `newPage()`：补采结束不关闭自建页；同会话重复补采可能残留同会话多 tab（DEC-060"2 个重复会话页"）。
2. **修复目标（零语义变更红线）：**
   - **消歧**：tab 选择规则显式化——补采=必须命中目标 CONV_UUID 且多命中时取最近活跃页；派单=优先复用空闲 chatgpt 页并导航，歧义（多候选）时按显式规则选最近活跃；选择结果落 result.json/log 可审计。
   - **清理**：链路终点（回复采集成功或 fail-closed 终态）后，关闭本次运行**自建**的页面；提供 `--tab-cleanup` 维护模式：枚举 chatgpt.com tab、按会话去重（每 CONV 保留最近活跃）、关闭重复与陈旧页；绝不关闭非本次运行且仍需值守的页（回复未采集完不得关）。
   - **不变量**：发送双验/禁重发/归属校验/fail-closed 语义零变更；review_leg.py 对 gpt_dispatch/recoll 模板的调用契约（CLI 参数、result.json 字段、退出码）零变更；review_leg.py 本体不修改。
3. **实现载体：** 新增 `phase0/tools/tab_hygiene.mjs` 共享件（枚举/选择/去重/关闭，纯函数化便于测试）+ 两处调用点接入 + `test_tab_hygiene.mjs`（跟随 test_dispatch_options.mjs 惯例，替身 page 列表，零真浏览器）；真实浏览器冒烟一次（派单链真实轮自然承载，不单开真实派单）。
4. **边界：** 不改 gpt_dispatch 发送/采集逻辑与 M1/M2 契约文件；不碰 review_leg.py；Chrome profile/登录态零接触；不引入自动重试/重派语义。
5. **流程：** 本任务按 Basic WORKFLOW v0.3：登记任务包→规划协商（ChatGPT 复审至共识）→用户拍板冻结步骤清单（L-020 授权下以"复审通过+节点授权"登记依据）→执行→独立验收（ChatGPT）；ST-05 申报前自检+ST-01 绑定申报照用。

## 验收目标（规划拍板时冻结细化，可观察结果）

- test_tab_hygiene.mjs 全过（退出 0），正反例覆盖：多 tab 消歧规则/每会话去重/自建页关闭/回复未采集不关；
- 真实链冒烟证据：至少一次真实派单或补采轮全程 tab 数量曲线可审计（运行前后 tab 清单落档），运行后无本次自建残留 tab；
- gpt_dispatch.mjs/recoll 模板 diff 仅限 tab 生命周期相关行；发送/采集/fail-closed 代码路径零改动（diff 可证）；
- 既有测试矩阵回归：test_dispatch_options.mjs 等全过。
