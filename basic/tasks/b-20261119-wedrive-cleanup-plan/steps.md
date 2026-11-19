# steps：b-20261119-wedrive-cleanup-plan（企微微盘本地文件清理）

- 方案性质：Basic 模块二规划协商（S1 派单）+ S2 用户授权执行；ChatGPT 回复为方案建议。
- 会话处理：`--new-session --no-update-pointer`（DEC-094 #4），新会话 URL=https://chatgpt.com/c/6afe7111-1aa0-83ec-a311-13d6ed8c0574，未覆盖 reviewer 指针。
- 目标澄清：用户明确"删微盘同步/下载到本地的文件，不是聊天记录、不是应用缓存"（requirement.md 原文）。

## S1 规划协商派单：微盘本地文件清理方案讨论

- ①本步骤目标：只读盘点企微微盘本地目录 → 经派单工具向 ChatGPT 发起"微盘本地文件清理方案"讨论 → 采集回复 + 归属校验 + SHA256 归档，产出供用户拍板的分级建议。
- ②修改文件：新增 `basic/tasks/b-20261119-wedrive-cleanup-plan/{requirement.md,task-brief.md,brief.txt,steps.md}`；派单证据落 `phase0/logs/dispatch-2026-11-19T03-45-33/`。未改业务代码/系统配置/微盘文件。
- ③修改内容：无代码 commit（控制层派单）。冻结简报 brief.txt（UTF-8 1134B，≤1200B）；request.txt SHA256=1651d096fff6d5905a039553345e46f390ed34c2ceed31c7b43645391eeb111a；非涉码任务，ST-01 被测 commit 绑定不适用。
- ④执行结果：代理稳定（ProxyEnable=1/port=1130）一次派单成功——发送双验通过；COMPLETED，1 assistant unit，回复 10224 UTF-8 字节。
- ⑤测试结果：reply.txt SHA256=37aeb2e8edf52bf3c8b4d274e745765c314c1fa91cc4ddd0f6360813dddeaa70 与工具 artifact_sha256 完全一致；JSON 解析 OK，六键齐全（safe_clean/need_confirm/cloud_impact/steps/next_inventory/notes）；标记 wedrive20261119 在 request 唯一命中（归属校验）。本机只读盘点：微盘根目录 D:\WeChat\WXWork\<企业ID>\WeDrive\（12 企业ID）；最大企业 1688853086578186=18.32GB/307文件。
- ⑥验收证据引用：dispatch 目录=phase0/logs/dispatch-2026-11-19T03-45-33（reply.txt SHA256=37aeb2e8edf52bf3c8b4d274e745765c314c1fa91cc4ddd0f6360813dddeaa70）；包内证据 acceptance/s1-dispatch-digest.txt；标记 wedrive20261119 唯一命中；**S1 验收结论：PASS**（派单/采集/归档闭环）。

## S2 用户授权执行：删除全部 12 个 WeDrive 本地目录（2026-11-19）

- ①本步骤目标：用户确认云端文件仍在、授权删除全部 12 个企业 WeDrive 本地副本（非聊天记录），以可恢复方式释放本机空间。
- ②修改文件：删除 `D:\WeChat\WXWork\<12个企业ID>\WeDrive\` 共 19.594GB/789 文件（移入回收站）；新增任务包 `acceptance/wedrive-delete-manifest.txt`（删除清单）。未改聊天记录/应用配置。
- ③修改内容：删除前三项前置核验——(a) 用户明确"确认过还在云端，本地直接删除"；(b) 用户选"先退出企微再删"，实测 WXWork/WXWorkWeb 进程已全退、残留 WeChatAppEx×10 经路径核实为个人微信 xwechat 插件（与 WeDrive 同步无关）；(c) 用户选"删所有 12 个企业 WeDrive"。删除清单 12 目录/19.594GB 留证。无被测 commit（非涉码）。
- ④执行结果：用 `Microsoft.VisualBasic.FileIO.FileSystem::DeleteDirectory(...SendToRecycleBin)` 将 12 目录**移入回收站**（可恢复，非永久删除），12/12 成功、0 失败；复核残留 WeDrive 目录数=0。
- ⑤测试结果：删除后 D 盘可用 21.44→21.46GB（**未显著释放——文件在回收站仍占 D 盘空间**）；回收站现 19.59GB/914 文件与本次删除量吻合；Shell 回收站项目总数 1800，其中仅 12 项为本次 WeDrive，其余 1788 项为历史删除。**未测项**：云端文件实际状态（用户自述确认，本会话无法验证）、企微重登后是否重新同步（未重启企微验证）。
- ⑥验收证据引用：删除清单 acceptance/wedrive-delete-manifest.txt；方案依据 dispatch-2026-11-19T03-45-33（reply.txt SHA256=37aeb2e8edf52bf3c8b4d274e745765c314c1fa91cc4ddd0f6360813dddeaa70）；用户授权＝本会话"确认过，还在云端，本地直接删除吧"+ question_answer（先退出企微再删/删所有12个）；**S2 验收结论：PASS**（授权范围内 12 目录全部移入回收站、零误删聊天记录；永久清空回收站未执行，因会误删 1788 个历史项）。

## 关键状态与后续提醒

- **当前状态**：12 个 WeDrive 目录已从原路径移入回收站（可恢复）；D 盘空间尚未释放（回收站占用）。
- **未做且不应自动做**：未清空回收站——回收站 1800 项中仅 12 项是本次目标，清空会误删其余 1788 项历史文件。若用户要真正释放 19.59GB，需**单独、精确地**还原/清除这 12 项对应的回收站对象，或用户自行在回收站中只删这些项。
- **云端风险**：用户自述云端仍在；ChatGPT 警示停认证企业本地副本可能是唯一副本——本次按用户明确授权删除，责任归属用户确认。

## ChatGPT 方案建议要点（原文见 reply.txt）

- **最高警戒**：已停认证企业的 18.32GB 目录按"潜在唯一副本"处理；停认证≠云端已删/仍在；账号失权后可能永久无法恢复。
- **云端影响三态**：另存为下载副本删除不影响云端；同步目录双向同步时资源管理器删除可能被同步到云端；微盘界面删除=云端操作影响其他成员。
- **流程**：冻结→确认企业ID身份→查同步状态→建清单→验证云端副本→备份唯一副本→优先客户端本地空间管理→手动删为最后手段→复核→不靠卸载清理。

## 红线声明

数据删除属 DEC-010 高危红线；ChatGPT 网页会话无命令执行能力（CAP-20261113-001）。S2 依用户本人明确授权执行，采用可恢复方式（回收站），未永久删除、未触碰聊天记录。
