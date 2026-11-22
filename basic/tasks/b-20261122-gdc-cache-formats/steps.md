# 步骤清单（b-20261122-gdc-cache-formats）

**方案状态：** 用户指令即方案框架（本地分析→ChatGPT 讨论→方案，不改代码），无需另立 steps 冻结轮；节点自主推进（L-020）。

## S1 开工登记

①本步骤目标：建任务包 + GDC dev 分支拉最新 + 基线登记。

②修改文件：basic/tasks/b-20261122-gdc-cache-formats/{requirement.md,task-brief.md,steps.md}。

③修改内容：登记用户原话（任务2片段）；Standard/S2 选型；M2 并行登记。

④执行结果：任务包建妥；GDC 已 git pull origin dev（新增 e2e/generationBatch.ts 等文件）；基线 GDC=`5c9ba1558a58b29633ea731fcdb563361b4c343b`。

⑤测试结果：check_taskpack 复跑回填（steps.md 建立后）。

⑥验收证据引用：dispatch-2026-11-22T06-01-40（回填自 S3 证据）；reply SHA256=02b77989c40a6e75b673a2b0055fe796a98a6da905d3431ab2bd700f63cef7c5。

**验收结论：PASS**（开工登记齐备；独立验收证据随 S3 派单轮统一落盘）

## S2 本地分析（进行中——Explore 子代理执行）

①本步骤目标：缓存机制本体/缓存键/格式覆盖/图片加载点全扫描/漏网判定/上传链路，六节报告。

②修改文件：basic/tasks/b-20261122-gdc-cache-formats/analysis.md（待子代理报告落盘）。

③修改内容：子代理执行中（只读扫描 D:\Garden-Design-Calculator @ 5c9ba155）。

④执行结果：待子代理返回。

⑤测试结果：未测（只读静态分析）。

⑥验收证据引用：dispatch-2026-11-22T06-01-40（回填自 S3 证据）；reply SHA256=02b77989c40a6e75b673a2b0055fe796a98a6da905d3431ab2bd700f63cef7c5。

## S3 ChatGPT 讨论（已完成）

①本步骤目标：派单漏网格式结论+三问至独立审查会话，采集 reply，结合意见形成方案。

②修改文件：phase0/logs/dispatch-2026-11-22T06-01-40/（派单现场）；acceptance/{request-r1.txt,reply-r1.txt}；proposal.md（新增）。

③修改内容：简报 brief_t2_cache_formats_r1.txt（1182B）派发独立新会话；reply 全文归档。

④执行结果：审查方裁定=定性升级为「GDC 图片资源准入、加载生命周期与截图完整性治理」；Q1 修改后同意（三层约束：上传入口/build_catalog 构建期校验/Worker 出口 415，白名单维持 4 种）；Q2 修改后同意（billboard 未加载不显示+capture gate 扩展等待+photo 补门禁）；Q3 同意（有限回退+错误传播，禁静默成功）；P0/P1 优先级成文。

⑤测试结果：未测（只读分析与方案任务）。

⑥验收证据引用：dispatch-2026-11-22T06-01-40；reply SHA256=02b77989c40a6e75b673a2b0055fe796a98a6da905d3431ab2bd700f63cef7c5；marker 绑定=GDC 缓存格式排查 R1（reply 首行含）。审查方自注：缩写 SHA 仅够方案级裁定，实施轮须附完整 40 位 SHA。

**验收结论：PASS**（三问逐项有裁定+reply 归档+方案落 proposal.md；最终验收=用户查阅测试报告）
