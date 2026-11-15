# 验收复验请求 R3：b-20261115-basic-replication-verify（迁移接棒+只复核 P1-1/P1-2 两处）

## 接棒声明（新审查会话必读）

- 前审查会话（6af93e42-91e8-83ec-943f-8e312e1b50a0）上下文达上限（CONTEXT_LIMIT_STOP，自动化停止未发送，无重发风险），本请求即新会话首条消息——请从本文件接棒全部复验工作。
- 背景速读（按本 commit 读）：`basic/WORKFLOW.md`（v0.3 已生效）、`docs/phase1/decision-log.md` 尾部（DEC-049 节点判定/DEC-050）、`AGENTS.md`（执行方纪律文件，内容供了解，你按本文件执行即可）。

## 任务与裁定链

- 任务：b-20261115-basic-replication-verify（Basic D1 可复制性实战验证，DEC-045 D1 产品级标准）。
- 方案冻结：前会话规划 R1 裁定"修改后同意"（reply sha256=fc8478d79cc0a634e406bff7030e60a9862f8ab4eb254cd1e2903b3298cbd974），五项修改全采纳，依节点自主推进授权（WORKFLOW 增补②）替代用户逐项拍板。
- S1 被测 commit=85895dd1c416b332907fe162754bce0ee66f6c2b（演练+报告）。
- R1 验收裁定=REJECT 3 项 P1（reply sha256=26bcf99f35ccf34c0fa81287678c183c10990440df07fd96e38480eb54e4964f）；整改 commit=59505121c5b69b9aec8a38fa4bf8dcc1d539089a（问题1/2 补档+问题3 剥离依据）。
- R2 复核裁定=REJECT 剩 2 项（reply sha256=3ac8c1f06638391984bf93a2aa6a5520da1fe5477c8517529bdda76451562355）：P1-1 MANIFEST SHA 不匹配／P1-2 报告"零副作用"无条件表述；**问题3（recoll 脚本剥离）已按先例关闭**（lessons-recoll R2 先例：recoll_*.mjs 属过程审计附件非被测逻辑），不重复审。
- 整改 commit=2e6ad7112ce1590f03d107699b82de6d58b18f1a。

## 本轮复验范围（只此两处，其余不重复审）

1. **P1-1**：`acceptance/ls-MANIFEST.txt` 全部 SHA256 已改按 **Git blob 内容**计算（根因=工作区 CRLF 与仓库 LF 差异致 npm-ci-exec.txt 条目不匹配）；npm-ci-exec.txt=068f98824ba7056679e25b83ccf76bcb008ce8ce2f152e9087b16667ae8a4243（与你在 R2 的独立计算一致）；逐文件分类标注（原始输出 7+执行记录补档 3+报告 1）不变。请独立重算核对全部 11 条。
2. **P1-2**：`acceptance/replication-report.md` 第五表与第三节"零副作用"无条件结论已改"部分可证：执行时点前后快照未留存，当前态快照不能替代历史对照"，与第四节披露一致。请核对表述一致性。

## 请求结论

三态：PASS（问题1/2 关闭+S1 整体验收结论）/ REJECT（列具体项）/ BLOCKED。回执请附结论表与 reply SHA256。
