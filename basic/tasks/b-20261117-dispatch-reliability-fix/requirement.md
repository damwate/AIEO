# 需求原文：派单链可靠性缺陷清理（#3/#4/#7）——受控试运行前置

- 任务ID：b-20261117-dispatch-reliability-fix
- 日期：2026-11-17
- 立项依据：DEC-094（ChatGPT 会务拍板，问1=选B）+ DEC-093 遗留待办 #3/#4/#7 + DEC-026 路线（等级 B 受控试运行前置）+ 用户 2026-11-17 指令"跟 ChatGPT 讨论、由它拍板，大方案没问题即可，细节你俩解决"。

## 需求原文（用户指令，逐字不加工）

> "你用AIEO基础版开发吧，这种询问的跟chatgpt讨论，它来拍板，只要大的方案没问题就行，细节你俩解决"

## ChatGPT 拍板结论（DEC-094 reply，原文归档 phase0/logs/dispatch-2026-11-17T03-13-54/recoll/reply.txt，SHA-256=13cc2caa399f680ff1ebf934ce0ff13109051a04a548671f4b98b16ffefff228）

> 问1：选 B。先清除阻塞受控试运行的派单缺陷 #3、#4、#7，再建立等级 B 受控试运行 Gate。理由：这三项直接影响新会话任务采集、指针正确性及并发安全，不能带着已知派单风险进入真实任务试跑；H2 契约演进不应成为当前试运行的前置条件。
> 问2：选甲（已执行完毕，见 DEC-094）。
> 执行边界：被测基线固定 ee76a34 不得漂移；不触碰 DEC-010 高危操作；B 完成后重新验收再申请等级 B 受控试运行授权；不因本次拍板自动授权真实任务开工。

## 本任务范围（三项缺陷，逐项根因见 task-brief.md）

- **#3 新会话采集缺陷**：`--new-session` 首派后采集 fail-closed（INBOUND_START_UNIT_MISSING / INBOUND_WINDOW_COMPLETENESS_UNPROVEN 两型），固定 key 定位遇键漂移；手工 recoll+视口前置拉高为有效恢复但非自动。
- **#4 `--new-session` 指针覆盖缺陷**：发送后无条件以 `page.url()` 覆盖 reviewer 指针；多页 context 下可能选错页/捕获错误 UUID（两次实战复现）。
- **#7 mtime 同型隐患 + 并发锁缺口**：review_leg.py/arch_review_leg.py 的 `_find_dispatch_dir` 无 `since-2.0` 时钟负偏容差（test_acceptance_leg.py 已修）；review_leg.py 无 RunKeyLock（另两腿已有）。

## 边界约束

- 被测基线固定 ee76a34（本任务开工前生产代码树与 ee76a34 逐字节一致，已核）。
- 不触碰 DEC-010 高危（main 合并/生产发布/数据删除）；不申请等级 B 试运行开工（B 完成后另行验收+申请）。
- 公共工具引用不复制（WORKFLOW §代码抽取）；M1-M4 运行时代码零修改；冻结契约零修改。
- 每项修复必须交 ChatGPT 独立验收（Basic 工作流模块四），不自我宣布通过。
