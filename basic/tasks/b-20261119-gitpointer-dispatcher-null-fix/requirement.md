# 需求：GitPointer dispatcher:null 生产路径缺陷修复（Node v24 无代理 env 材料读取必失败）

- **用户原话（2026-11-19，不加工）：** "昨天AIEO标准版开发我让zcode接手了你的工作，zcode休息中，交接任务如下，你继续接棒"（交接任务=继续标准版开发；交接「四、遗留与下一步」建议下一节点="dispatcher:null 缺陷修复任务（经规划协商后实施）"）；
- **用户追加指令（2026-11-19，不加工）：** "请按照AIEO开发经验来"（针对 CDP 派单通道处置，指向开工第一动作跑固化工具、不手工拉起、不空转罢工——L-014 §6）；
- **用户历史委托（2026-11-19，不加工，沿用）：** "后面你继续标准版开发，如遇到要拍板的按照AIEO的basic版本派单给chatgpt决定，我关心的是整体进展，子任务你跟chatgpt商讨解决"（拍板委托 ChatGPT 派单渠道；DEC-010 红线仍归用户本人）；
- **依据链：** c2-batch2 `delivery.md` §6 未解决问题 #1 + §7 后续建议 #1 + `docs/phase1/decision-log.md` DEC-109「生产路径缺陷发现（SEPARATE_DEFECT_CONFIRMED，另立任务必办）」——Node v24.14.0 无代理 env 时 readGitPointer 传 `dispatcher:null`→fetch ERR_ASSERTION→材料读取必失败（④-D 驱动首轮实证）；修复方案 `dispatcher ?? undefined` 归一；**另立缺陷任务经规划协商后实施**。
- **选定版本/任务等级：** Basic 工作流 v0.3；等级 S2（公共工具缺陷修复+双环境验证，不触 DEC-010、不部署、不合并）；批准人=用户本人（节点自主推进授权）/拍板=ChatGPT 派单渠道。
- **本轮派单＝规划协商 R1**（缺陷事实+理解+初步方案→ChatGPT 复审→共识→冻结方案→S3 实施）。
