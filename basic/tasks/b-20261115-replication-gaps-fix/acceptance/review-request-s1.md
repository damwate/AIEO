# 验收请求：b-20261115-replication-gaps-fix S1（新审查会话请以此文件为准）

## ⚠️ 状态更正（优先读）

你上一轮按 `b-20261115-basic-replication-verify/acceptance/review-request-r3.md` 做的 R3 复验**已经过时**：该 R3 早已由前会话完成并关闭——R3 遗留的 P1-1（replication-report.md SHA=943dd0c9d869c12b23cf91168dc3023eae88bf193d241d1a2c2356f0b6d76625，与你独立计算一致）已修复于 commit 2f434ce，前会话 **R4 复验已 PASS**（reply sha256=a8bd85a25129fa8f634a4b676551578967ad86ef34db1d52b1e87348b9bfd9af，dispatch-2026-11-15T08-11-52）。D1 任务（basic-replication-verify）已 COMPLETED 并交付（commit 6905ee1）。请忽略 R3 请求，勿重复复验。

## 本轮真实任务：G1-G4 缺口修复（b-20261115-replication-gaps-fix）S1 验收

- 方案冻结：规划 R1 裁定"修改后同意"（reply sha256=068a3bf667f5ba73daac6c1d3e047578211fb503d84888c53b46dd56bc0a46ac，五项修改采纳+三不做），节点自主推进授权（WORKFLOW 增补②）。
- **被测 commit=3119ef6eb522d8062f96e81f4c0e8bdf1ffa5eff**（S1 成文；登记 commit 837e819=自查修正不属被测 diff）。
- 改动：①`toolkit/SETUP-CHECKLIST.md` 新环境初始化清单六节（基础环境表 Node≥20.18.1／仓库获取与网络 clone 与 check-push 能力区分／依赖安装／Chrome Profile 初始化四步含人工登录验证+敏感数据检查+与 ego-profile 分开／外部依赖清单 monitor 非必备／初始化完成确认）②`basic/WORKFLOW.md` 部署边界增三条（清单引用+外部依赖清单 G2+派单链 Windows 限制 G3）+附录增补③记录。
- 申报：一致性 37/37+DV1 6/6+negpos 7/7+专项 7/7 退出码全 0，检查器零修改；三不做遵守（未称派单链跨平台/未称新电脑验证完成/未动工具代码）；basic 现行条款语义不变（仅增补）；acceptance/gf-MANIFEST.txt 含 4 输出 SHA256。

## 验收点

①清单六节与你 R1 五项修改逐项对应（对照 `basic/tasks/b-20261115-basic-replication-verify/acceptance/replication-report.md` 的 G1-G4）②部署边界三声明准确（外部依赖/Windows 限制/清单引用）③37 项断言实测与四命令④边界（不动工具代码/basic 语义不变/清单不涉密）。

## 请求结论

三态：PASS（S1 验收结论）/ REJECT（列具体项）/ BLOCKED。回执请附结论表与 reply SHA256。
