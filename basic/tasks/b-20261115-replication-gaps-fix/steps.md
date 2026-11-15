# steps：b-20261115-replication-gaps-fix（Basic 可复制性缺口修复 G1-G4）

- 方案冻结记录：规划协商 R1 裁定"修改后同意"（reply sha256=068a3bf667f5ba73daac6c1d3e047578211fb503d84888c53b46dd56bc0a46ac），五项修改全采纳（Node≥20.18.1/clone 与 check-push 网络能力区分/profile 与 ego-profile 分开说明/人工登录验证+敏感数据检查/monitor 非必需）+三不做（不称派单链跨平台/不称新电脑验证完成/不动工具代码不扩 37 项），**依节点自主推进授权（增补②）以"ChatGPT 复审通过+节点授权"替代用户逐项拍板**
- 规划协商证据：dispatch-2026-11-15T08-17-03（采集一次成功），reply sha256=068a3bf6…46ac。规划材料绑定 commit=b94289c

## S1 清单成文与部署边界增补

- ①本步骤目标：G1+G4=新环境初始化清单成文；G2=外部依赖清单登记；G3=Windows 限制声明落位部署边界
- ②修改文件：toolkit/SETUP-CHECKLIST.md（新增）、basic/WORKFLOW.md（部署边界增三条+附录增补③记录）、本任务包
- ③修改内容：SETUP-CHECKLIST.md 六节（基础环境自装表含 Node≥20.18.1/仓库获取与网络[clone 与 check-push 能力区分]/依赖安装/Chrome Profile 初始化四步[人工登录验证+敏感数据检查，与 ego-profile 分开]/外部依赖清单/初始化完成确认）；WORKFLOW 部署边界增三条引用与声明。**待验收 commit 完整 SHA：3119ef6eb522d8062f96e81f4c0e8bdf1ffa5eff（S1 清单成文+部署边界增补，内容定格）**
- ④执行结果：三处增补完成；四命令重跑全过退出 0（37/37+DV1 6/6+negpos 7/7+专项 7/7，检查器零修改预判实测成立）；basic 现行条款语义未变（仅增补）
- ⑤测试结果：同④
- ⑥验收证据引用：待验收派单后登记
