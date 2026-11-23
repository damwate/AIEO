# 步骤清单（b-20261123-bms-quote-preview）

**方案状态：** 用户指令即方案框架（本地盘点→ChatGPT 讨论→实施就绪方案，不改码），无需另立 steps 冻结轮；节点自主推进（L-020）。

## S1 开工登记

①本步骤目标：建任务包（requirement/task-brief/steps）+ 环境清单 §4/§5 开工阅读 + BMS 基线登记。

②修改文件：basic/tasks/b-20261123-bms-quote-preview/{requirement.md,task-brief.md,steps.md}。

③修改内容：登记用户原话片段与前序 R1/R2 裁定路径；Standard/S2 选型三要素；M2 并行登记（通道串行 FIFO、目标仓只读、文件所有权）。

④执行结果：BMS 基线实查 `cf79e4c2d2b78ec6f27bbc0c76a8c274f5ca0d36`（master）；前序 R2 reply SHA256=fd66845fe52e8740d9f010f7ca0bf4e7ade5b2849f04b1f958fa148cfabf7c0b 复核一致（8787B，目录名用户口述 -12/盘上 -11 的 1 秒差异已登记，L-017）。

⑤测试结果：python -I basic/tool/check_taskpack.py basic/tasks/b-20261123-bms-quote-preview（S1 首检见 evidence/st05-initial.txt，随 S3 回填）。

⑥验收证据引用：dispatch-2026-11-20T05-49-11（前序 R2 派单现场）；SHA256 fd66845fe52e8740d9f010f7ca0bf4e7ade5b2849f04b1f958fa148cfabf7c0b。**验收结论：PASS**

## S2 本地盘点（已完成）

①本步骤目标：R2-A 第一步"页面/接口/字段/导出入口盘点"——四页签入口、整装价格字段、规格/单位源数据、pcs 与导出打印依赖。

②修改文件：basic/tasks/b-20261123-bms-quote-preview/analysis.md（新增）。

③修改内容：四页签 6-9 行与 handler 映射；SchemeItemDTO 有 skuPrice:124/artificialPrice:132 但全仓无 set 调用；无行级整装标识（仅合同层 ContractTypeEnum:9）；销售单位在 ModelItemDTO:26 等未进预览 DTO；pcs 可见 22 行/四文件 53 行；含重量导出=downExcel3(1718-1746)。

④执行结果：结论=前端文案/可见表可独立实施，后端三项数据（行级价+整装标识+单位规格）为展示前置门禁；改 li 文本不破坏 handler。

⑤测试结果：静态分析，无代码变更，测试不适用（如实标注）。

⑥验收证据引用：analysis.md；bms-ui 源文件 file:line 证据；盘点结论随 S3 派单核验，引用 dispatch-2026-11-23T06-28-37 与 reply SHA256=b2f4914ba523c9fa4c9665a88e6448d3d8b4f7026a4c8cbdcdf7ee42bb3ce616。**验收结论：PASS**

## S3 ChatGPT 讨论（已完成）

①本步骤目标：派单盘点结论+三问至独立新会话，采集 reply，形成实施就绪方案。

②修改文件：phase0/logs/dispatch-2026-11-23T06-28-37/（派单现场）；proposal.md（新增）。

③修改内容：简报 brief_bms_r2a_r1.txt（907B≤1200B）经 --new-session --no-update-pointer 派发；三问=分层核准/数据门禁/A01-A10 完整性；reply 全文归档。

④执行结果：审查方裁定=分层 PASS、留空 PASS（附条件）、A01-A10 待补原始清单；新增 A11-A20 与三个边界测试；三态门禁 VERIFIED/MISSING/INVALID；缺数据不得伪造。

⑤测试结果：未测（只读方案任务，无被测代码变更）。

⑥验收证据引用：dispatch-2026-11-23T06-28-37（会话 6b03dd4f-6e6c-83ec-8eb9-58df9b8393a6）；reply SHA256=b2f4914ba523c9fa4c9665a88e6448d3d8b4f7026a4c8cbdcdf7ee42bb3ce616；marker 回显=仅标题（未原样回显完整标记，同首次试运行现象，已登记）。**验收结论：PASS**
