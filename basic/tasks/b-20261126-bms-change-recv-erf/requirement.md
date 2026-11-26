# 需求原文（用户原话，不加工）

> 我刚才BMS的项目路径搞错了，你接手 BMS 变更单收款重构（Er+F）验收：先读 D:/AIEO/basic/tasks/b-20261126-bms-change-recv-erf/handoff.md，按其指向的需求文档 D:/javacode/yotin/document/01_业务功能/04_变更与结算专题/05_变更收款金额控制需求文档_20261126.md §7 验收矩阵，基于本地 commit service d95e7c07 / bms 0188505 做部署回归验收并把结论登记回任务夹；禁止扩范围事项见 handoff.md §12。 刚才ai改的都是老项目，你接这边来吧

> 刚才智谱说老仓库已经改到新仓库了，你检查下，本次只改变更单相关，看看有没有影响，然后给chatgpt派单验收。三仓库已全部落到 YotinGarden GitHub：
>
> 仓库	提交	内容	状态
> bms-service	a0789c11	变更收款控制重构，7 文件 +156/−37（rebase 到远端 28611b52 之上）	✅ 已推送
> bms-ui	342791f9	收款页下限校验+提示，3 文件 +54/−18（rebase 到 1a0742d6 之上，与老仓库 0188505 逐字节一致）	✅ 已推送
> bms-document	c2ca137	05 §8.3 状态表登记新 SHA + 迁移记录（02/03/05 全套在 d347e32）	✅ 已推送
> AIEO 交接包已同步更新为新仓库基线（handoff.md，本地提交 41f451a，codex 直接读盘即可）。他人 WIP 均已保回原状：bms-service 7 个未提交文件在作区、bms-document 留在 stash，未动未提交。

> 用AIEO的standard版本里面的workflow解决遇到的问题、

> 差不多了就提交代码和文档吧，交接给codex验收（2026-11-27，S2 独立验收 REJECT 两处 P0 报告后拍板）

> 提交到git，给我一句话交接给codex（2026-11-27，批准推送任务分支与 AIEO main）

> codex在远端，你把交接文档也提交到git吧（2026-11-27，批准交接证据入 Git 供远端 codex 读取）
