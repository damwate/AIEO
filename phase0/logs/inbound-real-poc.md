# AIEO Phase 1 入站真实 POC 记录

- 执行时间：2026-11-12 04:00:44–04:02:53 UTC
- 会话：`https://chatgpt.com/c/6af52d27-e44c-83ee-95a4-888c1709afcb`
- 性质：非审查技术测试；只要求 GPT 输出 JSON，不读取仓库、不调用工具。
- 工具退出码：**0**（管道中取 `PIPESTATUS[0]`）。

## 执行命令

```bash
node D:/AIEO/phase0/tools/gpt_dispatch.mjs --message-file D:/AIEO/phase0/tools/inbound-real-poc-message.txt
```

控制台完整输出另存于 `D:\AIEO\phase0\logs\inbound-real-poc-console.log`。请求文件为 `D:\AIEO\phase0\logs\dispatch-2026-11-12T04-00-43\request.txt`，实际发送内容为 493 UTF-8 字节，低于单条 1200 字节上限。

## 真实提取结果

| 项目 | 实测值 |
|---|---|
| 发送双验 user unit key | `fallback-turn-2:0:user` |
| assistant unit key | `fallback-turn-2:2:assistant` |
| assistant unit 数量 | 1 |
| assistant UUID | `8535d4f2-1c41-4091-817f-7b7c0f3f314a` |
| 两次完整读取间隔 | 3020ms（≥3000ms） |
| key 列表 / 数量 / 逐 unit 全文 SHA-256 / UUID | 两次读取全部一致 |
| `reply.txt` 原始字节数 | **6625 bytes**（>1200） |
| `reply.txt` SHA-256 | `27c6c9e3c3e644cd6abcf0ebab932793d5f6c5dc3fb92aedbcc15e2b5f230af7` |
| `raw-units.json` 原始字节数 | 7217 bytes |
| `raw-units.json` SHA-256 | `5871f6f348febc008b98a880148e5c0811de4fb1871a9a4b598f9b6a568d15de` |
| JSON `text` 实际长度 | 2212 个 Unicode code point，其中汉字 2013 个 |

请求要求 `text` 约 1500 中文字符（1400–1600）；GPT 实际返回长度超出该请求区间。此处不将长度表述为“恰好 1500 字”，但回复确为完整 JSON 内容且入站原始 artifact 为 6625 字节，满足本次 >1200 字节验证目标。原始 DOM 辅助标签 `ChatGPT 说：` 也按契约保留在 artifact 中；独立验证从第一个 `{` 起成功解析 JSON，字段恰为 `test` 和 `text`。

本次未提供 `--task-id`、`--execution-id`、`--correlation-id`，`result.json` 对应字段均不存在，未伪造关联 ID。

## artifact 与独立回读

证据目录：`D:\AIEO\phase0\logs\dispatch-2026-11-12T04-00-43\`

- `request.txt`：实际发送的短指令。
- `run.log`：会话锁、基线尾部、本次 user unit key、生成完成、哈希和退出过程。
- `raw-units.json`：原始 unit key、原始 `innerText`、逐 unit SHA-256/size、assistant UUID。
- `reply.txt`：按 DOM 顺序以单换行合成的原始文本，无截断、无 trim、无空白折叠。
- `result.json`：unit 元数据、两次稳定读取结果、artifact hash/size、路径、会话 URL、全部完成 checks。
- `sent-dispatch.png` / `reply-dispatch.png`：发送和回复现场截图。
- `independent-verification.json`：工具退出后独立回读核验结果。

工具先在原始 artifact 写盘后回读校验，再写 `result.json`。独立使用 `sha256sum`、`wc -c` 和 Node 原始 Buffer 再次核对，确认：

1. `reply.txt` 的磁盘 SHA-256/size 与 `result.json` 的 `artifact_sha256`、`reply_readback_sha256`、`size_bytes` 完全一致。
2. `raw-units.json` 的磁盘 SHA-256/size 与 `result.json` 元数据完全一致。
3. `raw-units.json` 中各 unit 原始文本以单换行合成后，与 `reply.txt` 逐字节相等；`result.json.reply` 也与磁盘文本完全相等。
4. `completion_checks` 和稳定性 checks 全为 true；真实回复超过 1200 UTF-8 字节。
5. 上述独立核验命令退出码为 **0**，机器结果见 `independent-verification.json`。

## 证据边界

这是当前会话、当前 DOM 下的单 assistant unit 真实长回复 POC。多 assistant unit、起点因虚拟列表缺失、unit 新增/文本变化/UUID 变化、间隔不足和 artifact 篡改负例由本地自动化测试覆盖；本次没有伪造这些网页故障，也不据此宣称所有网页状态、真实多 unit 回复或 M1 登记链路已验证。

POC 完成后仅将后续截图写入收敛到 dispatch 目录，移除 `phase0/screenshots/` 全局副本写入，入站提取、稳定判定和 artifact 逻辑未再变化；未为这一非功能路径调整重复发送网页消息。
