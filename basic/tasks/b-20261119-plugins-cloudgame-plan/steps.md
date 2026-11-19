# steps：b-20261119-plugins-cloudgame-plan（插件/软件与云游戏考察讨论）

- 方案性质：Basic 模块二规划协商（S1 派单），非涉码、非删除任务；ChatGPT 回复为方案建议。
- 会话处理：`--new-session --no-update-pointer`（DEC-094 #4），新会话 URL=https://chatgpt.com/c/6afe7a50-61b8-83ec-836f-3d9f11813d1a，未覆盖 reviewer 指针。
- 触发：用户"考察完之后同样可以跟chatgpt讨论"——将本机软件/插件多版本、闲置迹象与云游戏替代性考察结果交 ChatGPT 评估。

## S1 规划协商派单：考察结果讨论

- ①本步骤目标：整理已完成的只读考察结果（多版本/闲置软件、VSCode 扩展、云原神/云异环替代性）为自包含简报 → 经派单工具向 ChatGPT 发起讨论 → 采集回复 + 归属校验 + SHA256 归档，产出供用户拍板的分级建议；全程不删任何文件/软件。
- ②修改文件：新增 `basic/tasks/b-20261119-plugins-cloudgame-plan/{requirement.md,brief.txt,steps.md}`；派单证据落 `phase0/logs/dispatch-2026-11-19T04-24-55/`；考察原始清单复用 `b-20261119-bigfiles-cleanup-plan/acceptance/installed-software.json`。未改业务代码/系统配置/软件。
- ③修改内容：无代码 commit（控制层派单）。冻结简报 brief.txt（UTF-8 实测 1194B，≤1200B）；request.txt SHA256=f6693886ce123629373b4a1d35cdcd6d70ffbcf34417eb75b65edfbc5b479e36；非涉码任务，ST-01 被测 commit 绑定不适用。
- ④执行结果：代理稳定（ProxyEnable=1/port=1130）一次派单成功——发送双验通过（polls=2）；COMPLETED，1 assistant unit，回复 4583 UTF-8 字节。简报因含较多事实多次精简至 1194B（保留全部决策相关项）。
- ⑤测试结果：reply.txt SHA256=54f5b8ba13bb2c7115f7420159417d5412b64561f9c354903dae5bed192270dd 与工具 artifact_sha256 完全一致；JSON 解析 OK，五键齐全（safe_clean/forbid/plugin_verdict/cloud_verdict/alternatives）；标记 pluginscloud 在 request 唯一命中（归属校验）。未测项：实际卸载/云游戏体验（本任务不执行、由用户实测，N/A）。
- ⑥验收证据引用：dispatch 目录=phase0/logs/dispatch-2026-11-19T04-24-55（reply.txt SHA256=54f5b8ba13bb2c7115f7420159417d5412b64561f9c354903dae5bed192270dd）；包内证据 acceptance/s1-dispatch-digest.txt；标记 pluginscloud 唯一命中；**S1 验收结论：PASS**（派单/采集/归档闭环；ChatGPT 仅给方案，未删任何文件/软件）。

## ChatGPT 方案建议要点（原文见 reply.txt）

- **可安全清理（须逐项确认）**：FileZilla 3.69（确认 3.70 正常+备份站点配置后）、未用的 VSCode 扩展（Continue 9月未动、migrate-java-to-azure、IntelliCode）、CC Switch（备份配置）、独立 JRE（须先核实依赖）。
- **禁止触碰**：WebView2 135+143（共享运行时）、VC++ 多版本（各软件依赖不同版本）、未核实依赖前的 Java 环境、SakuraCat/Podman/7-Zip 所谓"双份"（多为注册表 32/64 位视图）、仍在用的 claude-code/redhat.java、本地游戏数据、任何共享运行库。
- **判定标准**：①当前无使用需求；②无其他应用依赖；③有配置备份/可恢复安装包；④卸载后验证相关应用正常。任何卸载须用户最终确认。
- **云游戏结论（明确）**：不建议以免费云游戏完全替代本地原神/异环。理由——免费时长少（各每日15分）、免费排队优先级最低（原神高峰等半小时，与"排队不久"硬要求冲突）、买免排队卡又违反"免费"且形成持续成本、依赖网络/服务器无法保证随时进。云游戏仅适合临时/外出体验。
- **备选方案**：A 首选=保留游戏、研究把安装目录迁到更充裕 SSD（用启动器重定位，勿直删原目录）；B=清闲置软件/扩展；C=预算允许加独立 SSD（按 300GB+ 可用规划）；D=本地为主+免费云为辅；E=暂不卸载。顺序：先清闲置软件/扩展→评估游戏盘迁移→最后加 SSD。

## 红线声明

数据删除属 DEC-010 高危红线；ChatGPT 网页会话无命令执行能力（CAP-20261113-001）。本任务**仅产出方案建议**，未删除任何文件、未卸载任何软件；实际清理/卸载须用户本人逐项拍板后另行实施。
