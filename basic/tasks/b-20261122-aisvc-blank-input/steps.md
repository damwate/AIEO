# 步骤清单（b-20261122-aisvc-blank-input）

**方案状态：** 用户指令即方案框架（本地分析→ChatGPT 讨论→方案，不改代码），无需另立 steps 冻结轮；节点自主推进（L-020）。

## S1 开工登记

①本步骤目标：建任务包（requirement/task-brief/steps）+ 环境清单 §4/§5 开工阅读 + 基线登记。

②修改文件：basic/tasks/b-20261122-aisvc-blank-input/{requirement.md,task-brief.md,steps.md}。

③修改内容：登记用户原话（三任务多任务试运行指令+本任务片段）；Standard/S2 选型三要素；M2 并行登记（通道级串行 FIFO、目标仓库只读、文件所有权）。

④执行结果：任务包建妥；基线 AISVC=`0c53c963d93e33c15ebd4498742828fcf9ffc57d`；环境清单已读（代理端口漂移纪律/ChatGPT 走系统代理/push 走 check-push.mjs）。

⑤测试结果：python -I basic/tool/check_taskpack.py basic/tasks/b-20261122-aisvc-blank-input → steps.md 建立后复跑回填。

⑥验收证据引用：dispatch-2026-11-22T05-58-32（回填自 S3 派单证据）；reply SHA256=6048534e6be7cb6c488f0b3f949aee4a8eac4dabaaca72db70eeece5caefb0ad。

**验收结论：PASS**（开工登记齐备；独立验收证据随 S3 派单轮统一落盘）

## S2 本地分析（已完成）

①本步骤目标：核对供应商参数现状（用户"最低1K"记忆）+ 输入链四环检测能力核查 + 白图识别结论。

②修改文件：basic/tasks/b-20261122-aisvc-blank-input/analysis.md（新增）。

③修改内容：参数=配置驱动（ai_provider_openai.py:355/662/749）+生产通道实读（1024x1024 固定）；输入链 storage.py:252 / job_spec.py:82-118 / multipart 直发均零内容检测；_validity 仅评估跑分（cli.py:179/admin_api.py:32）且 extrema 算法抓不住部分白块。

④执行结果：结论=白图/未加载完输入**当前不可识别**；"最低1K"校正为"生产配置固定1024×1024"；因果链与方案雏形成文（analysis.md A-D 节+三问）。

⑤测试结果：静态分析无测试执行项（如实标注"未测"——只读分析无被测代码变更）。

⑥验收证据引用：analysis.md；生产采证 C:\Users\youting\AppData\Local\Temp\yotin-aijobs\jobs.json。

## S3 ChatGPT 讨论（已完成）

①本步骤目标：派单分析结论+三问至独立审查会话，采集 reply，结合意见形成方案。

②修改文件：phase0/logs/dispatch-2026-11-22T05-58-32/（派单现场）；acceptance/{request-r1.txt,reply-r1.txt}；proposal.md（新增）。

③修改内容：简报 brief_t1_blank_r1.txt（1125B≤1200B 上限）经 --new-session --no-update-pointer 派发独立新会话；reply 全文归档。

④执行结果：审查方三问裁定=Q1 修改后同意（多指标分块联合检测+结构性留白/加载性白块两概念+L0-L3 分级+真实样本校准）、Q2 修改后同意（上游拦截 P0＞AISVC 告警放行 P1＞条件性 422 P2）、Q3 同意（输出端只做质量评价不自动拒绝）；架构原则=size 与输入完整性勿混淆。方案成文 proposal.md。

⑤测试结果：未测（只读分析与方案任务，无被测代码变更）。

⑥验收证据引用：dispatch-2026-11-22T05-58-32（会话 6b0284c3-06d0-83ec-bd06-d47dc956c122）；reply SHA256=6048534e6be7cb6c488f0b3f949aee4a8eac4dabaaca72db70eeece5caefb0ad；marker 绑定=[T1|AISVC白图输入R1]（reply 首行含）。

**验收结论：PASS**（三问逐项有裁定+reply 原始字节归档+方案落 proposal.md；最终验收=用户查阅测试报告）
