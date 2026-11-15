# S2 Gate2-R3 复评请求：b-20261115-standard-kickoff（只复核 R2-01/R2-02）

> 依据 Gate2-R2 裁定（reply sha256=666b86b2ce1545cf1f4c0eb89662f237fde294b08c30248d9cf1d791b4cca8ed，dispatch-2026-11-15T13-13-25）："修订 R2-01、R2-02 后，提交新的单 commit 被测对象，进行 S2-Gate2R3 复验，只复核这两项及其关联内容"。

## 绑定申报（ST-01，C1 工具机器核验）

- **待验收对象（2 commit 线性申报）：** `e3be3d3d52bb12bd161aa34c0c92db1ca929d7fc`（v0.7 主体：R2-01/R2-02 整改）＋`276a3be46579bf3088ed1a51fe9bce5afa445e41`（§7 截断行修复，随链申报）→ **待验收 commit=276a3be46579bf3088ed1a51fe9bce5afa445e41，基线=`674607159625adffd10b9a481243b63169e46824`（v0.6，Gate2-R2 被测对象）**，线性 2 commit
- **绑定核验（工具机器输出原文）：** `check-binding.py --baseline 6746071…24 --target 276a3be46579bf3088ed1a51fe9bce5afa445e41 --count 2` → **PASS**（R1=2 ✓／R2 链 ✓）；numstat 合计=**24＋17 docs/phase1/GPT03-REVIEW-LEG-CHARTER-DRAFT.md**（仅 1 文件）
- 本请求所在回填 commit 不属验收 diff 范围（ST-01 ④）。

## 两项整改对照

| 问题 | R2 要求 | 修正落位（v0.7） |
|---|---|---|
| R2-01 附录 B 字段列不足 | 补齐 9 字段列逐端点填写；8 端点不变；ACK 不回入 | 附录 B 重构 9 列：HTTP Method／完整 Path／Handler（机器清单实名：get_task/get_dependencies/get_artifact/get_board/submit_event/register_artifact/submit_message/register_review_report）／操作对象与作用范围／授权依据／允许请求字段·事件值·消息类型／幂等键规则与重复行为／拒绝条件与预期响应／副作用与验收用例；8 端点不变，ACK 仍移出 |
| R2-02 数量声明与 A7-A10 粒度 | 统一 11/12、7/8 行差异；A7-A10 补 A1-A6 同粒度 | 附录 D 声明统一=**恢复矩阵 12 行**（DEV_REPORTED×2/GIT_VALIDATING×2/CODE_REVIEW×5/TEST_ACCEPTANCE×1/REWORK×1/BLOCKED×1，未删任何恢复分支）＋**回滚接管规则 7 类**；A7-A10 补六要素（前置/故障注入或动作/预期状态/禁止行为/失败判定/必留证据） |

## 复验范围声明

- 只复核 R2-01/R2-02 及其关联内容；R2 已过三项（①③⑤）与 Gate1 PASS 不重审；问题5/6 历史保留。

**回执格式：** R2-01/R2-02 逐项＋总结论（定稿认可/仍需修订＋清单）。
