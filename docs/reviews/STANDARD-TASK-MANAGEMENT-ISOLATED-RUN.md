# 标准版任务管理隔离联调

使用临时 `AIEO_DB_PATH`、`AIEO_LOG_DIR`、`AIEO_ARTIFACT_DIR` 和 `AIEO_ENV=test`，先启动 M1 创建数据库。`AIEO_STANDARD_LIMIT` 默认为 1，隔离测试可设为 3。真实运行阶段继续依据 906⑥ 和阶段授权。

- 工作台在现有平台的「任务管理」页。独立任务可直接填写。批量批准提交 `plan_id`、`version`、项目和知识库信息，以及包含 `key`、`title`、`base_commit`、`acceptance_criteria`、`dependencies` 的步骤清单。依赖使用同批步骤 key。后续执行接口附上已验收的前置提交。
- 编辑器可以用 `next_standard_task` 查看队首，通过既有 `claim_task` 认领。多分支联调任务收到每个前置提交的映射，实际整合及其测试仍由联调任务执行。
- 经该隔离环境授权后，可用同一配置启动 `python -m app.platform.standard_review_worker`。它使用既有 Playwright CLI 和独立新会话。审查入队、证据摘要和未决轮次可通过 M1 查询。
- worker 中断且原派单已落完整产物时，`python -m app.platform.standard_review_worker --reconcile <队列序号>` 按原发送回执和结果文件核对。缺少完整结果时保留未决状态，仍需按既有归属校验流程补采。该命令只读取原证据。
- 暂停和回收接口当前由控制器或操作人确认。编辑器停写后才提交 `pause` 确认及检查点；恢复时传原 execution ID；验收落盘并确认子 Agent 已收尾后才提交 `recycle`。自动启动、停写证明、按队列自动恢复、自动回收及完整浏览器补采仍待联调接入。

验收入口为 `python -m pytest tests/platform -q`、`npm --prefix app/frontend run build`。隔离回归使用模拟浏览器适配器，真实 ChatGPT 和编辑器跨进程接管单独留证。
