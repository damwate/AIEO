# delivery：b-20261115-replication-gaps-fix（可复制性缺口修复 G1-G4）

## 原始需求
见 `requirement.md`（节点自主推进授权确认版；方案冻结=规划 R1"修改后同意"reply sha256=068a3bf6…46ac 五项采纳+三不做）。

## 最终实现内容
- `toolkit/SETUP-CHECKLIST.md`《Basic 新环境初始化清单》六节：基础环境自装表（Node≥20.18.1 等）/仓库获取与网络（clone 与 check-push 能力区分）/依赖安装/Chrome Profile 初始化四步（人工登录验证+敏感数据检查=路径事实与核验方法 runtime/ 仓库内被排除用 check-ignore+ls-files 核验）/外部依赖清单（monitor 非必备）/初始化完成确认。
- `basic/WORKFLOW.md` 部署边界增三条：初始化清单引用+外部依赖清单（G2）+派单链 Windows 限制（G3）+附录增补③记录。
- 修复对应：G1（profile 初始化文档化）✓/G2（外部依赖登记）✓/G3（Windows 声明）✓/G4（自装清单）✓；G5 跨电脑实测仍待验证（不冒充）。

## 修改文件
toolkit/SETUP-CHECKLIST.md（新增）、basic/WORKFLOW.md（部署边界三增补）、本任务包（四输出统一 acceptance/）。

## 测试结果
四命令全过退出 0（37/37+DV1 6/6+negpos 7/7+专项 7/7），检查器零修改；basic 现行条款语义不变。

## Git commit
链：b94289c（登记）→3119ef6（S1 被测）→837e819（自查修正）→71a6255/39fef01（R1 整改）→本 commit（S2 交付）。验收链：规划 reply sha256=068a3bf6…46ac→R1 验收 reply sha256=b19cae20…f77e4（REJECT 2 项）→R2 复验 reply sha256=09e938c9…41027（**S1 整体验收 PASS**）。

## 未解决问题
无阻断项。G5 跨电脑实测待条件（第二台设备）；profile 强杀损坏登录态的教训（本次实战：Stop-Process -Force 后需人工重登）已随 L-018 整改计划入库。

## 后续建议
①Basic 产品化剩余=backlog 两项（DEC-043 修复/recoll 策略沉淀，挂+重启条件）+代码类任务 v0.3 实战（待真实需求）；②本清单在下一次真实新环境/第二台设备时按 G5 实测回填。
