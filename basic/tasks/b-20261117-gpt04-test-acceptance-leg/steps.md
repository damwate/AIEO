# 步骤清单：b-20261117-gpt04-test-acceptance-leg

## S1 设计（PLANNED→IN_PROGRESS）

- ①本步骤目标：完成同构复制方案设计与 /reports/test 路线适配点清单。设计输入：charter v0.3（§3 D2 同构复制/A-1 白名单定稿/A-2 契约定稿/A-3 恢复矩阵 12 行/§4 15 组合矩阵）+arch_review_leg.py 结构实读（A0-A5 编排/EngineM1Client 参数化/RunKeyLock/_resume_inner/attach-reply）。
- ②修改文件：无（设计步，产出落 acceptance/design-notes.md）。
- ③修改内容：同构差异对照表（GPT-02→GPT-04：关口态 ARCH_REVIEW→TEST_ACCEPTANCE；登记路线 B artifacts×2+events→/reports/test 原生端点+duplicate 语义恢复；结论域映射 PASS→ACCEPTED/REWORK→REWORK；简报输入=验收标准+测试证据显式指针；契约=envelope+test-acceptance-review；ENGINE-02→ENGINE-03）+组合矩阵实现点+恢复矩阵 12 行映射。
- ④执行结果：acceptance/design-notes.md。
- ⑤测试结果：不适用（设计步）。
- ⑥验收证据引用：（交付时回填）

## S2 实施（PLANNED）

- ①本步骤目标：实现 test_acceptance_leg.py+契约落位+bootstrap。②修改文件：phase1/tools/test_acceptance_leg.py（新增）、contracts/v1.0/test-acceptance-review.schema.json（新增落位冻结）、phase1/tools/test_review_leg.py 不动、phase1/tools/review_leg.py 不动。③修改内容：A0 前置核查（TEST_ACCEPTANCE 态+allowed_events+验收标准/证据齐备）→A1 简报组装（显式证据指针+绑定字段+≤1200B）→A2 派单（M2 链复用三态账本）→A3 采集+归属强制校验+Ajv 契约校验→A4 结论登记（/reports/test：PASS/REWORK 提交端点内原子推进；15 组合矩阵 fail-closed；BLOCKED→artifacts+messages 留证）→A5 终态核对+A-3 12 行 resume+attach-reply 人工退路+RunKeyLock+setup-agents（ENGINE-03）。
- （红线核对）M1-M4 零修改（不触碰 app/）；scheduler.py 零修改；既有冻结契约零修改（新契约=新增文件）；1200B 硬限；敏感信息不入日志。
- ④执行结果：（实施后回填）⑤测试结果：（S3 后回填）⑥验收证据引用：（交付时回填）

## S3 测试与实战（PLANNED）

- ①本步骤目标：测试矩阵+三腿回归+零 mock 实战全链。②修改文件：phase1/tools/test_test_acceptance_leg.py（新增）。③修改内容：A1~A7 用例+负例（白名单越权/契约失败/简报超限/材料锚定 fail-closed/矩阵禁止组合 fail-closed/发送状态不确定 fail-closed/RunKeyLock 跨进程）+三腿合跑回归（test_review_leg+test_arch_review_leg+本矩阵）；零 mock 实战（真实 M1 实例+真实派单+真实 GPT-04 结论登记）。
- ④执行结果：（后回填）⑤测试结果：（实测后回填，含合跑用例数与 exit code）⑥验收证据引用：（交付时回填）

## S4 交付（PLANNED）

- ①本步骤目标：交付登记与验收复核闭环（G04-R 复核派单至审查会话 6afb41ae）。②修改文件：delivery.md、task-brief.md、acceptance/。③修改内容：交付登记+C1 绑定核验+实战账本归档+验收复核简报。
- ④执行结果：（后回填）⑤测试结果：（后回填）⑥验收证据引用：（交付时回填）

## 返工记录表（首次 REJECT 时建表；按"同一问题"计数）

（暂无——无 REJECT 历史）
