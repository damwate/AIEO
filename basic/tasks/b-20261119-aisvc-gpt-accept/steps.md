# 步骤清单（用户拍板冻结）

**用户拍板原文（2026-11-19）：** "完事之后你调用AIEO项目的basic功能提交chatgpt验收下，验收之前看看AIEO的开发经验文档"

**冻结方案要点：** 把 dispatch-2026-11-18T16-28-13/request.txt 的 [F2F3F4补强终审|AI-Image-Service] 简报原文（1139 字节，被审SHA 47f2ecc）保持一字不改，经 `phase0/tools/gpt_dispatch.mjs --message-file` 向现有审查会话（phase0/logs/gpt-reviewer-session.json：6afdc528-88ac-83ec-a9da-282ae6cf5432）派发并采集回复归档。拍板依据=用户直接指令（L-020 节点自主推进授权；本任务无代码改动，无独立规划协商环节需求）。

**会话迁移评估（L-018 第 6 条，2026-11-19）：** 该审查会话昨日累计 user 消息已超 4 条评估阈值；决定本轮**暂不迁移**——理由：简报含"你上轮:F2 FAIL/F3 PARTIAL、F4 PASS_WITH_CONSTRAINTS"回指，依赖会话上下文连续性，新会话需重写简报并补裁定点位；本轮验收闭环后再评估迁移。

## S1 派单执行：补强终审派发+回复采集+归档登记

| 要素 | 记录 |
|---|---|
| ① 本步骤目标 | [F2F3F4补强终审] 简报送达 ChatGPT 审查会话，采集其 JSON 验收回复并归档登记 |
| ② 修改文件 | （无业务代码修改）新增本任务包文件；派单证据由 gpt_dispatch 写入 phase0/logs/dispatch-<ts>/ |
| ③ 修改内容 | 派单消息=冻结简报原文 1139B（副本存本任务 acceptance/ 目录）；本次待验收 commit=（本任务无代码 commit；派单对象=AI-Image-Service@47f2ecc1f17f51cc1cbb2e326602f9447ed3407e，只读被审对象） |
| ④ 执行结果 | （待派单后回填） |
| ⑤ 测试结果 | 未测（S1 派单执行类任务，无代码测试；环境预检=系统代理 8514 实测 chatgpt.com HTTP 200/1.7s，Chrome gpt-poc profile CDP 9222 存活，2026-11-19 实查） |
| ⑥ 验收证据引用 | （待派单后回填：dispatch 目录+reply SHA256） |

**验收结论：** （待回填）
