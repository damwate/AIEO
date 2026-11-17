# S1 设计说明：派单链可靠性缺陷清理（#3/#4/#7）

- 日期：2026-11-17
- 基线：ee76a34ac5fb73d7e0fce6369060323c7f7a5016
- 根因调查：code-explorer 只读调查（带文件行号）；结论强度逐项标注 CONFIRMED/HYPOTHESIS。

## 1. 三缺陷根因对照表

| 缺陷 | 强度 | 抛出点/位置 | 根因 | 修复方向 | 验证点 |
|---|---|---|---|---|---|
| #3 新会话采集 | CONFIRMED | inbound_dom.mjs:120-125；inbound_reply.mjs:126-130/224-225/262-267 | gpt_dispatch.mjs:242-262 发送双验捕获固定 key `fallback-turn-0:0:user`，采集时精确匹配（inbound_dom.mjs:97-99）；ChatGPT 虚拟列表按滚动重排键，确认窗后起点被裁出→匹配失败（设计 fail-closed，非误判） | 视口前置拉高前移到首采；采集支持标记文本/expectedUnitKeys 归属定位；失败自动同会话 recoll（不重发） | 新会话首采稳定物化；固定 key 漂移走标记定位不误判；七查 fail-closed 负例仍过 |
| #4 指针覆盖 | 事故 CONFIRMED / 机制 HYPOTHESIS 偏 CONFIRMED | gpt_dispatch.mjs:375-390（无条件写 REVIEWER_SESSION）；attachPage 151-161→tab_hygiene.mjs:50-59（无 uuid 取 chatgpt[0]） | 发送后无条件以 page.url() 覆盖指针；多页 context 下可能选错页/捕获错误 UUID（wrong-session-record.json 实证 URL=6afb304c…，DEC-088/093 两次复现） | 写指针前显式开关/页归属校验；新会话强制 newPage+从无到有校验；事故复现固化集成负例 | --no-update-pointer（或等价）下指针不被覆盖；多页选错页拒写 |
| #7 mtime+锁 | CONFIRMED | review_leg.py:500-508（严格>=since 无容差无 brief_bytes）；arch_review_leg.py:367-389（有 brief_bytes 无容差）；review_leg.py 全文无 RunKeyLock | test_acceptance_leg.py:458-484 已修时钟负偏容差+字节归属，两腿未同构；review_leg.py 并发无锁（另两腿有 RunKeyLock） | 两腿 _find_dispatch_dir 对齐 since-2.0+brief_bytes；review_leg.py 同构复制 RunKeyLock 包裹 run/resume/attach_reply | mtime 1s 内定位/3s 外拒判确定性；review_leg.py 跨进程锁竞争实测 |

## 2. 已修参照（同构基线，禁止改）

- test_acceptance_leg.py:458-484 `_find_dispatch_dir`（since-2.0 容差 line 469 + brief_bytes 校验）；测试 test_test_acceptance_leg.py:783-803 `test_31_mtime_tolerance_deterministic`。
- arch_review_leg.py:98-139 / test_acceptance_leg.py:119-155 `RunKeyLock`；测试 test_arch_review_leg.py:638/650、test_test_acceptance_leg.py:766-778。

## 3. 修复边界（红线）

- 公共工具引用不复制；M1-M4 运行时零修改；冻结契约零修改；DEC-017 不解除。
- 被测基线 ee76a34 不漂移；不触碰 DEC-010；不申请等级 B 试运行开工。
- 每步交 ChatGPT 独立验收，绑定被测 commit 完整 40 位 SHA；fail-closed 负例强度不得降低（只放宽"能证明属于本轮"的定位，不放宽"证明不了就拒收"的原则）。

## 4. 回归清单

| 测试文件 | 既有用例 | 本任务新增期望 |
|---|---|---|
| phase1/tools/test_review_leg.py | 29 | mtime 负偏确定性 + 并发锁负例 |
| phase1/tools/test_arch_review_leg.py | 29 | mtime 容差用例 |
| phase1/tools/test_test_acceptance_leg.py | 31 | 零回归（已修参照不动） |
| phase0/tools/test_inbound_reply.mjs | 24 | 固定 key 漂移走标记归属 + 首采视口路径 |
| phase0/tools/test_tab_hygiene.mjs | 21 | 指针保护集成负例 |
| 合跑基线 | 89（三腿）+ 45（phase0 两集） | 全绿不回退 |

## 5. 待 ChatGPT 规划复审确认的三点

1. 三项修复方向无越界（不碰冻结契约/M1 运行时/DEC-010）。
2. 步骤顺序 #7→#4→#3（风险低→高）合理，或审查方另提顺序。
3. #4 的保护机制选择（显式开关 vs 页归属强校验）——本设计倾向两者都要（开关保兼容+归属校验保正确），请审查方确认或简化。
