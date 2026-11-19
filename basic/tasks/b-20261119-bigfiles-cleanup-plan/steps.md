# steps：b-20261119-bigfiles-cleanup-plan（大文件与已安装软件清理方案讨论）

- 方案性质：Basic 模块二规划协商（S1 派单），非涉码、非删除任务；ChatGPT 回复为方案建议。
- 会话处理：`--new-session --no-update-pointer`（DEC-094 #4），新会话 URL=https://chatgpt.com/c/6afe7763-a81c-83ec-9bcf-a8277a43b284，未覆盖 reviewer 指针。
- 触发：用户上轮微盘清理完成后要求"再看看其他大文件和已安装软件，跟 ChatGPT 讨论"。

## S1 规划协商派单：大文件/软件清理方案讨论

- ①本步骤目标：只读盘点 C/D 盘大文件、一级目录、已安装软件与 WSL → 经派单工具向 ChatGPT 发起清理方案讨论 → 采集回复 + 归属校验 + SHA256 归档，产出供用户拍板的分级建议；全程不删任何文件、不卸任何软件。
- ②修改文件：新增 `basic/tasks/b-20261119-bigfiles-cleanup-plan/{requirement.md,task-brief.md,brief.txt,steps.md}`；派单证据落 `phase0/logs/dispatch-2026-11-19T04-12-30/`。未改业务代码/系统配置/软件。
- ③修改内容：无代码 commit（控制层派单）。冻结简报 brief.txt（UTF-8 1182B，≤1200B）；request.txt SHA256=e2bf113ce58c6684ec0539050b7489c147b56f5608bae3d39675f904fcf48485；非涉码任务，ST-01 被测 commit 绑定不适用。
- ④执行结果：代理稳定（ProxyEnable=1/port=1130）一次派单成功——发送双验通过；COMPLETED，1 assistant unit，回复 10459 UTF-8 字节。
- ⑤测试结果：reply.txt SHA256=e349bfdfa67c811a687355a55d897b17812a4d5fbdf854ba7fab20040eb51c50 与工具 artifact_sha256 完全一致；JSON 解析 OK，六键齐全（safe_clean/need_confirm/forbid/steps/next_inventory/notes）；标记 bigfiles20261119 在 request 唯一命中（归属校验）。前序清理复核：C 盘可用 22.47GB、D 盘 44.39GB、回收站空；微盘仅残留 1 个 0GB/2文件目录（客户端重建，可忽略）。未测项：实际卸载/删除效果（本任务不执行，N/A）。
- ⑥验收证据引用：dispatch 目录=phase0/logs/dispatch-2026-11-19T04-12-30（reply.txt SHA256=e349bfdfa67c811a687355a55d897b17812a4d5fbdf854ba7fab20040eb51c50）；包内证据 acceptance/s1-dispatch-digest.txt；标记 bigfiles20261119 唯一命中；**S1 验收结论：PASS**（派单/采集/归档闭环；ChatGPT 仅给方案，未删任何文件）。

## ChatGPT 方案建议要点（原文见 reply.txt）

- **总原则**：C 盘 22.47GB / D 盘 44.39GB 已缓解，不建议为追求数字冒险清理。Stopped≠无用、体积大≠垃圾、可重下载≠可未经确认删除。
- **最大空间来源**：两款游戏——原神 144.4GB + 异环 86.3GB，全部官方卸载理论最多释放 ~230.7GB。必须逐款由用户确认；用官方卸载入口/启动器，不直接删游戏目录；卸载后只读复查残留（存档/截图/配置可能值得保留）。
- **可安全清理（有条件）**：游戏官方卸载（确认不玩）；SQL 备份（分类检查时间/归属/可恢复性/异地副本，确认重复且可恢复后才清）；VideoHighlighter 6.1G / AI-Game-Clipper 3.6G（先用软件自带缓存清理功能）。
- **须用户确认**：原神/异环去留、SQL 备份、WSL vhdx（先 `wsl --list --verbose`+备份+正常注销，禁直删 vhdx）、旧开发工具逐项、微信 6G（用自带文件管理）。
- **禁止**：异环 pakchunk*.ucas/.pak 与原神资源文件（挑大文件删会损坏游戏）、WSL vhdx 直删、Windows 系统目录、ProgramData/AppData 整体、javacode 整体、.git 目录、Navicat 配置/数据库、微信企微主数据目录、Installer/驱动/共享运行库。
- **顺序**：建基线→确认游戏去留→官方卸载→查残留→SQL备份→WSL/Podman→开发工具→视频工具→逐项验证（每项独立授权，不扩展为批量授权）。
- **next_inventory（P1）**：javacode 目录与 SQL 备份归属、WSL 详情、两款游戏安装路径与用户数据位置、Program Files 9.6G 二级清单、视频工具数据。

## 红线声明

数据删除属 DEC-010 高危红线；ChatGPT 网页会话无命令执行能力（CAP-20261113-001）。本任务**仅产出方案建议**，未删除任何文件、未卸载任何软件；实际清理须用户本人逐项拍板后另行实施。
