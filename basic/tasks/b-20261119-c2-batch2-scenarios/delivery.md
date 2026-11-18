# delivery：b-20261119-c2-batch2-scenarios（906/C2 第二批受控用例，①→④-A→④-B→④-D1→④-D2→⑤ 逐项验证）

- **最终结果：COMPLETED**——六项受控场景全部执行并经 ChatGPT 逐项独立签核（5 PASS+1 BLOCKED 签核）；逐项解除登记=DEC-109。

## 1. 原始需求

用户 2026-11-19："请你继续推进标准版开发"（附 CodeBuddy 交接，其待办第 1 条=906/C2 ①④⑤⑥ REWORK 下一批受控验证）+"后面你继续标准版开发，如遇到要拍板的按照AIEO的basic版本派单给chatgpt决定……子任务你跟chatgpt商讨解决"（拍板委托 ChatGPT 渠道）。依据链=DEC-107→DEC-108（立项+规划协商+v0.3 冻结+S3 GO）→本交付（S3 执行+S4 签核+DEC-109 解除登记）。

## 2. 最终实现内容

- **S2 规划协商三轮闭环（DEC-108）**：R1 ADJUST→R2 PASS→R3 终局拍板 PASS（批准④-D 独立新增/接受④-C BLOCKED_IMPLEMENTATION_OUT_OF_SCOPE/冻结 v0.3+S3 GO）；④ 重构为④-A 死会话/④-B 限时断网/④-C monitor 梯子核验门/④-D1 网络耗尽/④-D2 HTTP 耗尽五层验收对象。
- **S3 受控执行（六场景）**：①多 unit 采集（主尝试+备用触发一次，模型终答"无法拆分"→**BLOCKED 模型侧**）；④-A 死会话派单（创建→PATCH 删除 GET404 死态→死会话派单→ChatGPT 重定向副作用会话→**SESSION_ATTRIBUTION_FAIL 拦截错误成功**）；④-B 限时断网（页面级 CDP offline 隔离窗口→ERR_INTERNET_DISCONNECTED 中止→恢复验证 RESTORED=true）；④-D1 连接拒绝耗尽（4 尝试/3 退避/`GIT_POINTER_NETWORK_RETRY_EXHAUSTED`/退避实测 2085/3682/8289ms 在窗）；④-D2 503 耗尽（服务端日志 4 次跨端印证/`GIT_POINTER_HTTP_RETRY_EXHAUSTED`/2339/3357/6737ms 在窗）；⑤ 部分读取失败两子例（B 404→`GIT_POINTER_NOT_FOUND` 内嵌禁回退语义；C SHA 不符→`GIT_POINTER_FILE_HASH_MISMATCH`；整体事务 fail-closed）。零生产代码写入；测试会话先存证后删除全验证；审查会话核验完好。
- **S4 逐项独立签核（新审查会话 6afdffa2）**：①PASS 签核（BLOCKED 终态）/④-A PASS（SAFE_FAILURE）/④-B PASS/④-D1 PASS/④-D2 PASS/⑤ PASS；全部 reply SHA256 登记（见 steps.md S4 表）。
- **DEC-017 逐项解除（DEC-109 正式登记）**：④-A→派单层死会话处理限制、④-B→派单层断网处理限制、④-D1→网络异常有限重试限制、④-D2→暂时性 HTTP 错误有限重试限制、⑤→多文件部分读取失败限制（scope 逐项以审查方裁定 JSON 为准）；①多 unit 限制保留、④-C monitor 梯子限制保留、⑥关联多任务 P1 门不适用。

## 3. 修改文件

- 任务包：basic/tasks/b-20261119-c2-batch2-scenarios/（requirement/task-brief v0.1→v0.3/steps/contract-binding.md/acceptance/s4-01-manifest.txt/delivery.md）
- 场景驱动（phase0/tools/）：recoll_c2batch2_r2/r3/s3_01/s4_04d1_diag/s4_04d2.mjs、c2batch2_s3_04a_inventory/delete/cleanup.mjs、c2batch2_s3_04b_window/restore/cleanup.mjs、c2batch2_s3_04d_05_driver.mjs、c2batch2_s4_04d1_domdiag.mjs、brief_c2batch2_*.txt
- 证据（phase0/logs/）：dispatch-2026-11-18T18-53-11 起至 20-05-03 全部派单/补采/诊断/清理现场（含中断首跑 18-51-36 未发送现场如实归档）
- 登记簿：docs/phase1/decision-log.md（DEC-108/109）、phase0/logs/gpt-reviewer-session.json（6afde23c→6afdf44d→6afdffa2，备份链 5 个）

## 4. 测试结果

- 规划协商 R1-R3 三轮+S4 六项八轮派单全部发送双验通过；4 次 fail-closed 全部按 L-018 禁重发+静态 DOM 补采闭环（七查+归属校验三件套全过，其中一次归属校验正确拦截同标记双轮）。
- 场景机器证据：④-D1/D2 attempts+服务端跨端日志+单调时钟退避实测全部在冻结窗口；⑤ 两子例错误码/路径定位/无降级可辨。
- 无效运行如实登记并保留教材现场：④-D ERR_ASSERTION 空心 PASS（机制核验揭穿，L-017 再证）、e5a 服务端 bug、S4-04D1 空回复轮次、FAILED_DIR 派生笔误（重跑修正，双跑 SHA 一致）。
- ST-05 终检：COMPLETED 态全项检查（见提交记录）；全量 AIEO 无代码变化，测试基线无回归议题（本任务零代码写入）。

## 5. Git commit

- 关键提交链：a1d14ad（残留归档）→7998c35（立项）→f5c6c8c（R1 闭环）→5599cc7（R2 闭环）→bb1aef7（R3+DEC-108）→7f5178b（S3-①/④-A）→bd39217（ST-05 修复）→60160e6（④-B）→23487c9（④-D/⑤+契约绑定）→e8939b2（S4-01 整改）→156146f（空回复轮次）→本提交（S4 签核+S5 收口+DEC-109）。全部经 check-push 推送（ahead=0 口径逐次复核）。

## 6. 未解决问题

1. **生产路径缺陷（SEPARATE_DEFECT_CONFIRMED，必办）**：Node v24.14.0 无代理 env 时 readGitPointer 传 `dispatcher:null` → fetch ERR_ASSERTION → 材料读取必失败（本轮实证）。修复方案（如 `dispatcher ?? undefined` 归一）+无代理/有代理双环境验证，**另立缺陷任务经规划协商后实施**；本批测试侧以 realFetch 包装适配，生产代码零改动。
2. **④-C monitor 死页梯子**：BLOCKED_IMPLEMENTATION_OUT_OF_SCOPE 保留（实现入口在 agent-kit monitor 层，本机无克隆）；壳层就绪检查不拦死页的演进建议一并登记。
3. **①多 assistant unit**：模型侧无法在单轮产生多独立气泡（BLOCKED 签核）；限制保留，未来模型能力或界面变化时重开。
4. **⑥平台级并发**：并入多任务实施方案 P1 验证门，随 P1 授权推进。

## 7. 后续建议

1. 另立 GitPointer dispatcher:null 缺陷修复任务（优先，影响材料读取生产路径）。
2. DEC-017 五项解除后，C2 扩展场景下一批（若有）按同模式小步推进；906/C2 剩余未验收扩展场景清单见 platform-contract §2.6.8。
3. 多任务实施方案 P1 待用户逐级批准（DEC-107 边界），批准后 ⑥ 验证门随 P1 落地。
4. 审查会话 6afdffa2 已承载 7 条 user 消息（S4 末段），下一任务按换题迁移先例开新会话。
5. admin auth 基线失败排查（AI-Image-Service，承接 F3 delivery 后续建议 #3，与本任务无关另立）。
