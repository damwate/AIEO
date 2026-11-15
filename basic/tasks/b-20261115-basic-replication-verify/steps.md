# steps：b-20261115-basic-replication-verify（Basic D1 可复制性实战验证）

- 方案冻结记录：规划协商 R1 裁定"修改后同意"（reply sha256=fc8478d79cc0a634e406bff7030e60a9862f8ab4eb254cd1e2903b3298cbd974），五项修改全采纳（八项核验清单/依赖安装前后两次体检对照/公共工具链全列+PowerShell 与 Windows Chrome 路径限制如实/外部 skills 与 monitor 依赖登记/报告落位 acceptance/+P0P1P2 分级标准+"本机模拟"≠"真正新电脑"结论区分），**依节点自主推进授权（增补②）以"ChatGPT 复审通过+节点授权"替代用户逐项拍板**
- 规划协商证据：dispatch-2026-11-15T07-40-32（采集 fail-closed 禁重发）→ recoll_rep_plan.mjs 补采 recoll-2026-11-15T07-41-17-054Z（七查全过，reply sha256=fc8478d7…cbd974）。规划材料绑定 commit=d05f46be4bc5ec942ee1b27c5a0bf0be64c59351

## S1 演练执行与报告成文

- ①本步骤目标：新环境初始化全流程演练（clone→两次体检对照→核心工具核验→部署边界对照）+《Basic 可复制性验证报告》成文（缺口 P0/P1/P2 分级）
- ②修改文件：本任务包 acceptance/（replication-report.md+9 个原始输出+ls-MANIFEST.txt）、task-brief/steps
- ③修改内容：演练八步全执行（clone 经代理成功 HEAD=d05f46b/fsck 净/工作区净/无代理条目；第一次体检 2 FAIL 均为设计排除项；npm ci 恢复 playwright；第二次体检残留 1 FAIL=chrome profile 登录态人工初始化；check_taskpack×3 全 PASS 退出 0 与主区一致；check-push 诊断模式零副作用；治理文档全齐备；skills/monitor=主机级外部依赖如实登记）。**待验收 commit 完整 SHA：85895dd1c416b332907fe162754bce0ee66f6c2b（S1 报告+初始证据定格；补档 3 文件+MANIFEST 重生成登记于整改 commit，不属被测 diff）**
- ④执行结果：报告成文（P0=0/P1=2[G1 profile 初始化未文档化/G2 skills 外部依赖未登记]/P2=2[G3 Windows 专属限制未声明/G4 自装清单]/待验证 1[G5 跨电脑实测]）；**证据链缺陷自查即纠正：第一次体检原始输出未落盘（仅终端），删 clone 目录干净重做全流程，两次体检对照证据真实落盘（1st=2 FAIL→2nd=1 FAIL 与报告一致）**
- ⑤测试结果：clone 内四类核验全过（taskpack×3+check-push 诊断+check-env 两次）；主工作区四命令不受影响（本任务未触碰）
- ⑥验收证据引用：R1 验收=recoll_rep_acc.mjs 补采 recoll-2026-11-15T07-51-13-129Z（dispatch-2026-11-15T07-47-38 发送双验通过后 fail-closed），reply sha256=26bcf99f35ccf34c0fa81287678c183c10990440df07fd96e38480eb54e4964f，裁定=REJECT 3 项 P1[问题1=证据清单不一致+fsck/npm ci 缺原始记录/问题2=check-push 零副作用缺前后状态证据/问题3=recoll_rep_plan.mjs 新增工具脚本超"不修改工具代码"字面边界]；演练主体与报告质量基本符合冻结方案+执行证据纪律获特别认可（首检未落盘主动重做）——整改见返工表；复核待派

## 返工记录表（首次 REJECT 时建表）

| 问题编号 | 轮次来源 | 问题描述 | 整改内容 | 修复 commit | 验证 |
|---|---|---|---|---|---|
| 问题1 | R1 验收 REJECT P1-1 | 原始输出数量与 MANIFEST 不一致（申报 9 实为 7 输出+报告+清单）；fsck/npm ci 缺独立执行记录 | 补档 fsck-exec.txt（退出码 0）+npm-ci-exec.txt（如实补记 stdout 未落盘，退出码按执行时终端记录）+报告清单计数修正+MANIFEST 重生成（准确分类原始输出 7+补档 3+报告 1） | 59505121c5b69b9aec8a38fa4bf8dcc1d539089a | 复核轮确认 |
| 问题2 | R1 验收 REJECT P1-2 | check-push 零副作用缺前后状态证据 | 补档 check-push-before-after.txt（当前态快照 proxy=0/status=0/HEAD=origin/main=无 push；执行时点快照未落盘如实标注"部分可证"不补造） | 59505121c5b69b9aec8a38fa4bf8dcc1d539089a（同问题1） | 复核轮确认 |
| 问题3 | R1 验收 REJECT P1-3 | recoll_rep_plan.mjs 新增工具脚本超 requirement"不修改任何工具代码"字面边界 | 剥离依据登记（非修复）：recoll 派生脚本=DEC-043/L-018 既有恢复机制的每任务延续（派单基础设施），此前各任务均随 commit 归档且 R2 复核（lessons-recoll，reply 2986a76b…）已裁定"recoll_*.mjs 属过程审计附件不是被测逻辑"——本脚本属同一既有独立工作模式，申请排除出本任务验收范围，由验收方按先例裁定 | 59505121c5b69b9aec8a38fa4bf8dcc1d539089a（同问题1） | 待验收方按先例裁定 |
