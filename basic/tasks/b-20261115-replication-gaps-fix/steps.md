# steps：b-20261115-replication-gaps-fix（Basic 可复制性缺口修复 G1-G4）

- 方案冻结记录：规划协商 R1 裁定"修改后同意"（reply sha256=068a3bf667f5ba73daac6c1d3e047578211fb503d84888c53b46dd56bc0a46ac），五项修改全采纳（Node≥20.18.1/clone 与 check-push 网络能力区分/profile 与 ego-profile 分开说明/人工登录验证+敏感数据检查/monitor 非必需）+三不做（不称派单链跨平台/不称新电脑验证完成/不动工具代码不扩 37 项），**依节点自主推进授权（增补②）以"ChatGPT 复审通过+节点授权"替代用户逐项拍板**
- 规划协商证据：dispatch-2026-11-15T08-17-03（采集一次成功），reply sha256=068a3bf6…46ac。规划材料绑定 commit=b94289c

## S1 清单成文与部署边界增补

- ①本步骤目标：G1+G4=新环境初始化清单成文；G2=外部依赖清单登记；G3=Windows 限制声明落位部署边界
- ②修改文件：toolkit/SETUP-CHECKLIST.md（新增）、basic/WORKFLOW.md（部署边界增三条+附录增补③记录）、本任务包
- ③修改内容：SETUP-CHECKLIST.md 六节（基础环境自装表含 Node≥20.18.1/仓库获取与网络[clone 与 check-push 能力区分]/依赖安装/Chrome Profile 初始化四步[人工登录验证+敏感数据检查，与 ego-profile 分开]/外部依赖清单/初始化完成确认）；WORKFLOW 部署边界增三条引用与声明。**待验收 commit 完整 SHA：3119ef6eb522d8062f96e81f4c0e8bdf1ffa5eff（S1 清单成文+部署边界增补，内容定格）**
- ④执行结果：三处增补完成；四命令重跑全过退出 0（37/37+DV1 6/6+negpos 7/7+专项 7/7，检查器零修改预判实测成立）；basic 现行条款语义未变（仅增补）
- ⑤测试结果：同④
- ⑥验收证据引用：R1 验收=dispatch-2026-11-15T09-17-54（登录恢复后新会话首派，reply sha256=b19cae20a665923a8c31a80653040a4c0d4533a9be919d5929fe1ac8a87e77e4，裁定 REJECT 2 项[问题1=P1 路径事实（runtime/ 仓库内表述错误）/问题2=P2 MANIFEST 不完整]）；R2 复验=dispatch-2026-11-15T09-23-31（reply sha256=09e938c942c382181ebced7b99c4b3bafc03cdd967adbceadd82aec34a301027，问题1/问题2 关闭+**S1 整体验收结论：PASS**）

## S2 独立验收与交付

- ①本步骤目标：交付登记（S1 验收已 PASS）
- ②修改文件：本任务包 delivery.md、task-brief（完成态）、steps（本登记）
- ③修改内容：delivery.md 七要素成文；task-brief 转完成态
- ④执行结果：任务 COMPLETED（G1-G4 修复交付；G5 跨电脑实测仍为待验证不冒充）
- ⑤测试结果：四命令全过（同 S1）
- ⑥验收证据引用：验收派单链=phase0/logs/dispatch-2026-11-15T09-17-54（R1）+phase0/logs/dispatch-2026-11-15T09-23-31（R2 复验）；R2 复验 reply sha256=09e938c942c382181ebced7b99c4b3bafc03cdd967adbceadd82aec34a301027（问题1/问题2 关闭）；**S1 验收结论：PASS**；交付登记 commit=本 commit

## 返工记录表（首次 REJECT 时建表）

| 问题编号 | 轮次来源 | 问题描述 | 整改内容 | 修复 commit | 验证 |
|---|---|---|---|---|---|
| 问题1 | R1 验收 REJECT P1 | SETUP-CHECKLIST 敏感数据检查表述路径事实错误（runtime/ 写成"仓库外"，实为仓库内被 .gitignore 排除，涉 Git 安全边界） | 改为路径事实与核验方法（git check-ignore -v+git ls-files runtime/=0，不能只凭 git status） | 39fef01874881a363836ae897ff747d6e07f9f61 | R2 复验关闭确认 |
| 问题2 | R1 验收 REJECT P2 | 四份输出 MANIFEST 只登记 1 条且输出位于任务根（申报"4 输出 SHA256"不成立） | 三输出 git mv 统一移入 acceptance/（内容未变，R2 核验 blob 一致）+gf-MANIFEST 重生成 4 条按提交后 LF 字节 SHA256 | 39fef01874881a363836ae897ff747d6e07f9f61 | R2 复验关闭确认 |
