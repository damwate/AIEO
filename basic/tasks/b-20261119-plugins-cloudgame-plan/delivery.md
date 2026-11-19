# 交付总结：b-20261119-plugins-cloudgame-plan

## 1. 原始需求（用户原话）

> 看看那些已经安装的插件，软件等，有些可能安装了多个版本，有的可能根本就没用了，能找出来吗？上面的游戏还在玩，看看本机安装云原神是否可替代原神，云异环是否能替代异环；如果用云游戏，要求：能免费玩，免费的话排队不会太久
> 考察完之后同样可以跟chatgpt讨论

## 2. 最终实现内容

将已完成的只读考察结果（多版本/闲置软件、VSCode 扩展、云游戏替代性）整理为自包含简报，经 AIEO Basic 工作流 `phase0/tools/gpt_dispatch.mjs` 向 ChatGPT 新会话派发 → 采集回复 + 归属校验 + SHA256 归档 → 产出分级建议交用户拍板。**全程零删除、零卸载、零系统配置改动。**

## 3. 修改文件

- 新增 `basic/tasks/b-20261119-plugins-cloudgame-plan/`（requirement.md / task-brief.md / brief.txt / steps.md / acceptance/s1-dispatch-digest.txt / delivery.md）。
- 派单原始证据 `phase0/logs/dispatch-2026-11-19T04-24-55/`。
- 未改业务代码/系统配置/软件；`--no-update-pointer` 未覆盖审查会话指针。

## 4. 测试结果

- 简报 1194B（≤1200B），代理稳定一次派单成功；发送双验通过；回复 4583B。
- reply.txt SHA256=54f5b8ba13bb2c7115f7420159417d5412b64561f9c354903dae5bed192270dd 与 artifact 一致；JSON 五键齐全；标记 pluginscloud 归属唯一命中。
- ST-05 任务包自检：6/6 PASS，Overall PASS。

## 5. Git commit

无（控制层考察整理 + 派单，无业务代码变更；工作区为 main 干净）。任务包文档是否入库由用户决定，本任务不自提交。

## 6. 未解决问题

- **未执行任何删除/卸载**（DEC-010 红线，须用户逐项拍板）。
- 云游戏实测体验（排队时长、画质、网络）未验证，仅基于官方政策与第三方资料；由用户自行实测。
- SakuraCat/Podman/7-Zip 是否真重复安装未逐一核实安装路径。

## 7. 后续建议

- 软件清理优先按 ChatGPT 判定标准逐项确认：FileZilla 旧版、未用 VSCode 扩展（continue/migrate-java-to-azure/IntelliCode）、CC Switch（先备份配置）；WebView2/VC++/Java 环境/共享运行库不动。
- 云游戏：结论为不建议完全替代本地游戏（免费时长少+免费排队久）；若试玩用免费额度临时体验，不买免排队卡。
- 省空间优先顺序：清闲置软件/扩展 → 评估游戏目录迁移到更充裕 SSD（用启动器重定位，勿直删）→ 预算允许加独立 SSD（300GB+）；两款仍在玩的游戏暂不卸载。
