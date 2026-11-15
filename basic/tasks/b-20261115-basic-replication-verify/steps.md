# steps：b-20261115-basic-replication-verify（Basic D1 可复制性实战验证）

- 方案冻结记录：规划协商 R1 裁定"修改后同意"（reply sha256=fc8478d79cc0a634e406bff7030e60a9862f8ab4eb254cd1e2903b3298cbd974），五项修改全采纳（八项核验清单/依赖安装前后两次体检对照/公共工具链全列+PowerShell 与 Windows Chrome 路径限制如实/外部 skills 与 monitor 依赖登记/报告落位 acceptance/+P0P1P2 分级标准+"本机模拟"≠"真正新电脑"结论区分），**依节点自主推进授权（增补②）以"ChatGPT 复审通过+节点授权"替代用户逐项拍板**
- 规划协商证据：dispatch-2026-11-15T07-40-32（采集 fail-closed 禁重发）→ recoll_rep_plan.mjs 补采 recoll-2026-11-15T07-41-17-054Z（七查全过，reply sha256=fc8478d7…cbd974）。规划材料绑定 commit=d05f46be4bc5ec942ee1b27c5a0bf0be64c59351

## S1 演练执行与报告成文

- ①本步骤目标：新环境初始化全流程演练（clone→两次体检对照→核心工具核验→部署边界对照）+《Basic 可复制性验证报告》成文（缺口 P0/P1/P2 分级）
- ②修改文件：本任务包 acceptance/（replication-report.md+9 个原始输出+ls-MANIFEST.txt）、task-brief/steps
- ③修改内容：演练八步全执行（clone 经代理成功 HEAD=d05f46b/fsck 净/工作区净/无代理条目；第一次体检 2 FAIL 均为设计排除项；npm ci 恢复 playwright；第二次体检残留 1 FAIL=chrome profile 登录态人工初始化；check_taskpack×3 全 PASS 退出 0 与主区一致；check-push 诊断模式零副作用；治理文档全齐备；skills/monitor=主机级外部依赖如实登记）。**待验收 commit 完整 SHA：见本 commit（S1 报告与证据归档）**
- ④执行结果：报告成文（P0=0/P1=2[G1 profile 初始化未文档化/G2 skills 外部依赖未登记]/P2=2[G3 Windows 专属限制未声明/G4 自装清单]/待验证 1[G5 跨电脑实测]）；**证据链缺陷自查即纠正：第一次体检原始输出未落盘（仅终端），删 clone 目录干净重做全流程，两次体检对照证据真实落盘（1st=2 FAIL→2nd=1 FAIL 与报告一致）**
- ⑤测试结果：clone 内四类核验全过（taskpack×3+check-push 诊断+check-env 两次）；主工作区四命令不受影响（本任务未触碰）
- ⑥验收证据引用：待验收派单后登记
