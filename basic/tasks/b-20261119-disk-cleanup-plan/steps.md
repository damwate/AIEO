# steps：b-20261119-disk-cleanup-plan（本机磁盘清理方案讨论）

- 方案性质：Basic 模块二规划协商（S1 派单），非涉码任务；ChatGPT 回复为方案建议，非对本任务的验收裁定。
- 会话处理：`--new-session --no-update-pointer`（DEC-094 #4），新会话 URL=https://chatgpt.com/c/6afe6625-a5d0-83ec-a2a4-342078c6187b，未覆盖 reviewer 指针。

## S1 规划协商派单：本机磁盘清理方案讨论

- ①本步骤目标：按 Basic 工作流模块二，就"本机磁盘清理"经派单工具向 ChatGPT 发起方案讨论，采集回复并 SHA256 归档，产出供用户拍板的分级清理建议；全程不执行任何删除/移动。
- ②修改文件：新增 `basic/tasks/b-20261119-disk-cleanup-plan/{requirement.md,task-brief.md,brief.txt,steps.md}`；派单证据落 `phase0/logs/dispatch-2026-11-19T02-58-56/`。未改动任何业务代码/系统配置。
- ③修改内容：无代码 commit（控制层派单动作）。冻结简报 `brief.txt`（实测 UTF-8 1164B，≤1200B）；request.txt SHA256=71cf8ec7b54c9c792fd28d5ece7565abf2811852ffd76baa8db4945f180efd2f；非涉码任务，ST-01 被测 commit 绑定不适用。
- ④执行结果：首次派单（02:56）在 `page.goto` 阶段 `ERR_CONNECTION_TIMED_OUT`（发送前失败，零重发风险），根因＝代理客户端重启致 `ProxyEnable` 短暂翻 0、端口 1130↔14281 漂移（L-014/L-016）；按纪律只读诊断一轮，待代理稳定（enable=1/port=1130 连续 5 次采样）后清理遗留无代理 Chrome，第二次派单（02:58）成功。
- ⑤测试结果：派单完成——发送双验通过（polls=2, user_unit_key=fallback-turn-0:0:user）；COMPLETED，1 个 assistant unit，回复 12006 UTF-8 字节；reply.txt SHA256=2679768977d2061e09701e3bf63155faf9c06f57b35f1fb32a08387fb21b2068 与工具 artifact_sha256 完全一致；JSON 解析 OK，六键齐全（safe_clean=6/need_confirm=8/forbid=5/steps=9/next_inventory=10）；简报标记 `cleanup20261119` 在 request 中唯一命中（归属校验）。未测项：实际删除效果（本任务不执行删除，N/A）。
- ⑥验收证据引用：dispatch 目录=phase0/logs/dispatch-2026-11-19T02-58-56（reply.txt SHA256=2679768977d2061e09701e3bf63155faf9c06f57b35f1fb32a08387fb21b2068）；包内证据 acceptance/s1-dispatch-digest.txt；简报归属标记 cleanup20261119 唯一命中；**S1 验收结论：PASS**（本步＝派单/采集/归档闭环达成；ChatGPT 回复内容为方案建议，未执行任何删除）。

## 过程记录

- 环境预检 `node toolkit/check-env.mjs`：node 24.14 / git 2.47.1 / 派单链齐全；分支 main ahead=0 behind=0 工作区干净。
- 本机只读盘点：C 盘剩 8.2GB、D 盘剩 19.5GB；详见 task-brief「本机磁盘占用事实」。
- 派单故障处置严格遵循 L-014/L-016：不猜端口、不改注册表/系统代理、限一轮诊断、发送前失败才重试一次。

## S2 执行低风险缓存清理（用户 2026-11-19 拍板"同意清理"）

- ①本步骤目标：在用户拍板授权范围内执行第一批低风险缓存清理（npm/pip 缓存、Temp 陈旧文件、Chrome 缓存视状态），全程跳过占用文件与敏感目录，不做任何超范围删除。
- ②修改文件：仅删除缓存文件；更新本任务包 steps.md / delivery.md。未改动业务代码与系统配置。
- ③修改内容：授权口径＝用户"同意清理"理解为上一轮明确建议的"风险最低第一批"；Tencent/wsl/WPS/Downloads/Code/Cursor/游戏等需逐项确认目录**不在本次范围、未触碰**；无被测 commit（非涉码）。
- ④执行结果：①pip 缓存 `python -m pip cache purge` 成功，移除 657 文件/253.7MB（exit 0）；②Temp 7 天前陈旧文件 1069 个删除、2 个占用文件跳过，释放 688.7MB（Temp 2.983→2.311GB）；③npm `npm cache clean --force` 被环境安全护栏拦截（`[safe-delete] SAFE_DELETE_BULK_CONFIRM_REQUIRED` / `genie-trash.exe ETIMEDOUT`），未绕过护栏、npm-cache 保持 2.205GB 未变；④Chrome 缓存因 Chrome 运行中（17 进程）按计划规则未删；⑤Windows 更新缓存按要求只用系统工具、未手动删 SoftwareDistribution。
- ⑤测试结果：清理前 C 可用 10.62GB → 清理后 11.28GB（+0.66GB）；pip 与 Temp 合计确认释放约 0.94GB；未测项＝npm/Chrome/Windows 更新缓存未清（原因见④，非失败）。
- ⑥验收证据引用：授权来源＝用户消息"同意清理"（2026-11-19）；方案依据 dispatch-2026-11-19T02-58-56（reply.txt SHA256=2679768977d2061e09701e3bf63155faf9c06f57b35f1fb32a08387fb21b2068）；包内证据 acceptance/s1-dispatch-digest.txt；**S2 验收结论：PASS**（授权范围内清理达成，超范围项零触碰；护栏拦截项如实报告未绕过）。

## S3 Downloads 微盘文件清理请求：用户决定暂不删（2026-11-19）

- ①本步骤目标：用户要求清理"从公司A企微微盘下载到 Downloads 的那批文件"；执行前按 DEC-010 数据删除红线先做只读盘点与范围核对。
- ②修改文件：无（本步只读盘点 + 决策，未删任何文件、未改任何文件）。
- ③修改内容：只读盘点 Downloads（338 文件/0.52GB，按年份与文档类型分布），无法可靠区分哪些属"公司A微盘下载"；非涉码。
- ④执行结果：发现容量异常——上一轮盘点 Downloads 为 4.72GB、本轮为 0.52GB，本任务全程未碰 Downloads；向用户结构化确认。用户裁定：(a) 4.2GB 差异为其本人手动清除；(b) 识别依据选"先不删（保持现状，自行整理清单后再执行）"。据此**未删除任何文件**。
- ⑤测试结果：只读盘点完成；Downloads 文件在决策前后均保持 338 个/0.52GB（未变动）。未测项：N/A（无写操作）。
- ⑥验收证据引用：用户拍板＝本会话 question_answer（q-0=先不删 / q-1=我已手动清过），2026-11-19；方案依据 dispatch-2026-11-19T02-58-56（reply.txt SHA256=2679768977d2061e09701e3bf63155faf9c06f57b35f1fb32a08387fb21b2068）；包内证据 acceptance/s1-dispatch-digest.txt；**S3 验收结论：PASS**（遵循 DEC-010 红线，范围不明时零删除、如实上报、由用户本人裁定）。

## ChatGPT 方案建议摘要（原文见 reply.txt）

- **原则**：只读盘点→分类→备份验证→用户审批→执行→复核；优先解 C 盘压力，勿把 C 盘数据迁往同样紧张的 D 盘；不得把理论可回收空间当承诺。
- **第一阶段可安全清理（理论约 6–10GB）**：Temp 3.0GB（有条件）、npm-cache 2.2GB（`npm cache clean --force`）、pip 缓存 0.5GB（`pip cache purge`）、Chrome 缓存 0.23GB（仅勾缓存图片/文件）、Windows 更新缓存 0.25GB（用系统工具）、Downloads 4.7GB（仅逐项确认无用文件，禁止整目录清空）。
- **必须用户确认**：Tencent 8.5GB（微信/QQ 数据）、wsl 6.4GB（VHDX，先 `wsl --list --verbose`+`wsl --export` 备份）、Code 4.3GB、kingsoft/WPS 5.8GB、ifonts 2.1GB、Cursor 1.8GB、miHoYo 1.3GB、VS Code 扩展 1.3GB。
- **禁止删除**：Windows 系统核心目录、用户凭据（`.ssh`/`.git-credentials`/Protect/浏览器 Login Data）、源码与工程资产、备份及原始业务资产、不明虚拟磁盘/数据库（*.vhdx/*.db 等）。
- **短期目标**：C 盘保留 15–20GB 可用空间。

## 红线声明

数据删除属 DEC-010 高危红线；ChatGPT 网页会话无命令执行能力（CAP-20261113-001）。本任务**仅产出方案建议**，未执行任何删除；实际清理须用户本人逐项拍板后另行实施。
