# 步骤清单（b-20261119-p1-906-06-concurrency）

**方案状态：** v0.1 草案（待 R1 裁定 ⑥ 场景设计）。

## S1 登记

①本步骤目标：登记 P1 阻塞②（906⑥ 独立验证场景设计）任务包 + ST-05 自检。

②修改文件：basic/tasks/b-20261119-p1-906-06-concurrency/{requirement.md,task-brief.md,steps.md}。

③修改内容：登记来源（P1 execution R1 reply 9a79f7cf）、⑥ 定义与历史（batch1 REWORK/batch2 未执行/v1.0 归 P1）、七维度八判据、边界。

④执行结果：任务包建妥；基线提交前登记；ST-05 待回填。

⑤测试结果：check_taskpack.py 待提交后回填。

⑥验收证据引用：本任务包 S1 提交；R1 派单直读签核（待回填）。

**验收结论：PASS**（登记完成；独立验收见 S2 规划协商链）

## S2 规划协商

①本步骤目标：审查会话迁移（旧 6afe9bd3 归档只读）+ 906⑥ 独立场景设计 R1 裁定（七维度/八判据/环境/即停/证据）。

②修改文件：phase0/logs/gpt-reviewer-session.json + 备份 pre-906s1.json；phase0/tools/brief_906s1_plan_r1.txt；派单现场 dispatch-2026-11-19T06-54-56；本 steps.md。

③修改内容：R1 简报（1198B，标记 `[906S1-PLAN-R1|20261119]`）；R1=**ADJUST（PASS_WITH_CONSTRAINTS）**，reply `2d84f6bd…` 11158B，无 fail-closed。裁定：①七维度/八判据方向正确但需操作化补齐（并发登记两独立task/request/幂等键、REST三方关联、DB逐任务核对、ACK带状态版本、幂等、故障三类、证据关联）；②本机真实 M1 REST+DB 环境=BLOCKED（三件套无环境证据，须实测前独立只读环境资格检查，不合格维持 BLOCKED，不以 Mock/内存DB/顺序测试替代）；③五类即停+实测另批边界 PASS_WITH_CONSTRAINTS；④证据清单/判据/时间线须补具体字段+MANIFEST。审查方给出完整可执行场景：场景A双任务真实并发（同步屏障+服务端单调时钟证明处理区间重叠）、场景B四类故障F1-F4、场景C完整性复核、五类即停、证据目录、T0-T9时间线、验收总门槛（全过才⑥PASS）。**⑥仍 BLOCKED、M1写路径不解除**。

④执行结果：R1 ADJUST 裁定落定；要求修订场景设计 v0.2 后交 R2 复审；新会话 6afe9d76-5af0-83ec-bb84-77e7c54f409e（归属校验 PASS）。

⑤测试结果：reply.txt SHA256=`2d84f6bd658acd00d3cd2ada56e29c2e3b91458983cf21d0573b4991fb90d4d0`（11158B）与 result.json.artifact_sha256 逐字一致；三件套 Git Blob SHA（requirement 4a8424ef/steps 7fc58a29/task-brief 207a7420）审查方逐项列明；发送双验 polls=2；R1=ADJUST。

⑥验收证据引用：dispatch-2026-11-19T06-54-56（request/reply/raw-units/result/截图/run.log/tab-audit），reply SHA256=`2d84f6bd658acd00d3cd2ada56e29c2e3b91458983cf21d0573b4991fb90d4d0`；指针备份 phase0/logs/gpt-reviewer-session.pre-906s1.json。

**验收结论：PASS**（R1 规划协商完成，ADJUST 裁定；独立验收见 S4）

## S3 场景设计冻结

①本步骤目标：按 R1 ADJUST 把 906⑥ 可执行场景设计落为 v0.2（场景A/B/C+七维度+八判据+环境前置+五类即停+证据+时间线+验收标准），交 R2 复审。

②修改文件：basic/tasks/b-20261119-p1-906-06-concurrency/scenario-design.md（新建 v0.2）；task-brief.md（v0.1→v0.2）；本 steps.md。

③修改内容：scenario-design.md 逐条落 R1 场景建议（详见该文件九节）；关键保留=同步屏障+服务端处理时间重叠证明（否则判顺序执行）、F2 区分DB已提交与客户端未收响应、环境资格检查 BLOCKED 维持、五类即停先保全现场、MANIFEST 全证据、T0-T9 时间线、全过才⑥PASS；边界=本轮只设计不实测、⑥未PASS前M1写路径不解除、实测另批授权不继承。

④执行结果：v0.2 场景设计落盘；⑥ 仍 BLOCKED（环境未证实）；待 R2 复审。

⑤测试结果：scenario-design.md 九节对照 R1 逐项核对=场景A/B/C齐、七维度表齐、八判据齐、环境前置齐、五类即停齐、证据目录齐、T0-T9齐、验收总门槛齐；零代码/不实测/不合并/不部署/不删数据。

⑥验收证据引用：dispatch-2026-11-19T06-54-56，reply SHA256=`2d84f6bd658acd00d3cd2ada56e29c2e3b91458983cf21d0573b4991fb90d4d0`（设计依据）；scenario-design.md v0.2；S3 独立验收见 S4。

**验收结论：PASS**（v0.2 场景设计按 R1 落盘；独立验收见 S4）

## S4 独立验收（待执行）
（待回填）

## S5 收口交付（待执行）
（待回填）

---

## ST-05 自检记录
- S1：待回填。
