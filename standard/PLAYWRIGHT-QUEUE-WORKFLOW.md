# 标准版 IDE Agent 任务执行与 Playwright 派单

## 编辑器任务管理

- 指定一个主 IDE Agent 会话维护唯一任务池和操作记录。多个 IDE 同时打开时，其余会话执行已分配的任务。切换主会话先交接占额、暂停任务和未决派单。工作日开工先对账上次任务、占额与未决派单。普通任务入队尾；加急任务入队首，向用户显示预计让位任务并随加急指令一次确认。
- 大功能先经 ChatGPT 讨论，用户批准固定版本后，按该版本批量登记步骤、依赖、验收条件和基线。等待前置任务的步骤不占额。下游依赖通过验收的提交或产物，整体验收作为末尾步骤登记。
- 并行名额以获批阶段为准，目标上限为 3。开发任务各用独立编辑器会话、ChatGPT 用途会话、worktree 和分支。提交 ChatGPT、等回复、排空交接时仍持有名额。模型 PASS 与既有验收证据落盘后结项并回收子 Agent；REWORK 回到原任务。
- 加急让位先停开新步骤，确认子 Agent 停写，保存检查点并核清在途派单，再交接名额。仅因加急暂停且已安全交接的任务按队列顺序恢复。人工暂停、故障和未决发送继续走原恢复条件。主会话汇报当前占额、下一任务和各等待原因。

## ChatGPT 唯一派单入口

主 IDE Agent 统一指定一个服务工作区。主会话运行 worker；编辑器及各子 Agent 都通过**这个工作区的同一个脚本**提交和查询。任务进程不得直接开、切换、关闭浏览器或调用派单 CLI。Worker 用专属 `standard-queue` 浏览器实例和 profile，经授权准备该 profile 的 ChatGPT 登录与既有 `AGENT_KIT_DIR` 预算模块后启动。常规派单不读写全局 reviewer 指针。

```sh
python3 phase0/tools/playwright_queue.py worker
python3 phase0/tools/playwright_queue.py submit --task TASK-A --lane code-review --round R1 --brief /path/to/brief.txt
python3 phase0/tools/playwright_queue.py status
python3 phase0/tools/playwright_queue.py status 1
```

- `lane` 支持 `planning`、`architecture`、`code-review`、`test-acceptance`。同一任务和用途的首轮新建会话，后续轮绑定同一 UUID；跨任务或用途的已有 UUID 复用一律拒绝。主动迁移用新的轮次和经过确认的迁移简报，加 `--new-session`，旧 UUID 归属保留。按 L-018 在累计 4 条 user 消息时评估迁移。
- `task + lane + round` 是唯一提交键。客户端重试沿用原键和简报，服务自动加入轮次标记并校验合计 1200 UTF-8 字节。派单 FIFO 按数据库入队顺序，开发加急对派单 FIFO 无影响。成功结果返回 UUID、user unit 键、回复 SHA256 和本地证据路径。
- `NOT_SENT` 表示子进程退出且原发送回执证明未触发发送。修复原因后由主会话决定是否以新轮次提交。无回执或发送/采集未决则挂起通道，待原轮核对。重启不会重取 `RUNNING` 或 `BLOCKED` 轮次。
- 派单已完整落盘但 worker 没有记录完成时，使用 `reconcile <队列序号>`。如需补采，按 L-018 检查原会话、原 user unit 及现场目录，由控制方在独占浏览器时完成只读补采，再用 `reconcile <队列序号> --recoll <归档目录>` 导入。归档必须包含 `recoll-result.json`、`units-diag.json` 和 `reply.txt`。服务重验原发送回执、唯一轮次标记、最后 user、上轮 SHA 排除及采集检查。无法确认归属或原发送结果的轮次继续挂起。补采与导入均禁止重发。

隔离验收命令为 `python3 -m unittest discover -s phase0/tools -p test_playwright_queue.py`。使用模拟派单验证不同任务与用途不串号、同用途续轮、并发认领、崩溃后原轮补采和显式迁移。受管浏览器、真实网页和现行阶段门禁按批准范围单独验收。
