# SHA256 对账记录：F05 反证（P1-01 审计 R1 发现复核，2026-11-20）

- **背景：** P1AUDIT01-R1 reply SHA256 `0c3200480a0f80426682e64a657879d2b7824bd7ca0bddbe45217ac427897c1c`（6459B，会话 `6aff4393-8e90-83ec-97cb-5c2eaa1d40a6`，现场 `phase0/logs/dispatch-2026-11-19T18-43-43/`）裁定 #4/#5 FAIL，其中 F05="reply.txt 与声明的 artifact SHA 对应内容不一致"。执行会话按 L-017（断言≠一致性证明，配正反例复核）本地对账如下。

## 对账命令与结果（被测冻结 commit 7f7830b8 下）

```bash
git show 7f7830b80bdaa6a5c48510c74a621319bf32e419:phase0/logs/dispatch-2026-11-17T06-11-17/reply.txt | sha256sum
# => a5d099d62e6881c3d625c3bf1c08454f49fe62c098a0eb9bf25fa18cb036a631  (814 字节)
git show 7f7830b80bdaa6a5c48510c74a621319bf32e419:phase0/logs/dispatch-2026-11-17T06-11-17/result.json
# => artifact_sha256=a5d099d6…；reply 字段 814 字节且以"ChatGPT 说："开头；SHA256(reply 字段)=a5d099d6…
```

| 对象 | 字节 | SHA256 前 16 位 | 与声明 artifact 一致 |
|---|---|---|---|
| 冻结 commit 下 reply.txt 全文 | 814 | a5d099d62e6881c3 | **是** |
| result.json.reply 字段 | 814 | a5d099d62e6881c3 | **是** |
| run.log 声明 / raw-units text_sha256 | — | a5d099d62e6881c3 | **是** |

## 口径澄清（工具链既有约定，可复验）

- `gpt_dispatch.mjs` 的 `artifact_sha256` = **reply.txt 全文字节的 SHA256**，而 reply.txt 首行"ChatGPT 说："是该文件既有组成部分（人读包装行），**不是额外追加内容**。814 字节=含前缀行的全文，与声明一致。
- 独立旁证（同口径第二例）：`phase0/logs/dispatch-2026-11-19T18-33-05/reply.txt` 5843 字节，SHA256 `fedb72e25bac2dd46e56a00b261d8634a9ae23de2b79720ebb311c00a36ee2dc`=其 result.json.artifact_sha256，同样含"ChatGPT 说："首行。

## 结论

- **F05 的 factual 基础不成立**：不存在"带前缀 reply.txt vs 不带前缀原始回复"的字节差；reply.txt 自身即声明 SHA 的哈希对象，四处声明（run.log/result.json 三处/raw-units）与实际文件逐字一致。
- R1 中 #4 的 FAIL 与 #5 中 F05 分量基于该误读，应回审查会话（同会话 6aff4393）附本对账记录请求复核；F01–F04、F06 为证据缺口类发现，不受本对账影响、维持原判登记。
