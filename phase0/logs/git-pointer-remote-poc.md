# GitPointer 真实发布与 GitHub SHA 回读 POC

**日期：** 2026-11-12
**结果：** COMPLETE（exit 0）
**真实读取 commit：** `26ed31009ccb17d0ddf525e19b6d085d2f5193a8`

## 1. 材料与发布

材料：`phase0/poc-material/handoff/task.md`（354 字节）和 `data.json`（161 字节）。

```bash
node D:/AIEO/phase0/tools/git_pointer.mjs build \
  --root D:/AIEO \
  --file phase0/poc-material/handoff/task.md \
  --file phase0/poc-material/handoff/data.json \
  --manifest-path phase0/poc-material/handoff/manifest.json \
  --task-id T-P1-001 --execution-id EXEC-001 \
  --result D:/AIEO/phase0/logs/git-pointer-poc-build.json
```

生成 manifest：`phase0/poc-material/handoff/manifest.json`，588 字节，SHA-256 `8fdf3b93638c063ac008e1788a81496a93f1c455db82347f16f1a846be7d3a3c`。随后提交并推送 commit `26ed31009ccb17d0ddf525e19b6d085d2f5193a8`。

## 2. 指针与真实远程读取

```bash
node D:/AIEO/phase0/tools/git_pointer.mjs pointer \
  --owner damwate --repo AIEO --branch fix/AIEO-PHASE0-REVIEW-R10 \
  --commit-sha 26ed31009ccb17d0ddf525e19b6d085d2f5193a8 \
  --manifest-path phase0/poc-material/handoff/manifest.json \
  --manifest-file D:/AIEO/phase0/poc-material/handoff/manifest.json \
  --output D:/AIEO/phase0/logs/git-pointer-poc-pointer.json

HTTPS_PROXY=http://127.0.0.1:1150 \
node D:/AIEO/phase0/tools/git_pointer.mjs read \
  --pointer D:/AIEO/phase0/logs/git-pointer-poc-pointer.json \
  --output D:/AIEO/runtime/git-pointer-poc-read-26ed310
```

- 输出目录为执行前不存在的新空目录，远程内容不覆盖已有材料。
- manifest 与两个材料均通过 `raw.githubusercontent.com` 按完整 SHA 读取，HTTP 200，各 1 次请求。
- `status=COMPLETE`、`all_files_verified=true`，见 `phase0/logs/git-pointer-remote-read-result.json`。
- 独立 `sha256sum`/`wc -c` 回读：
  - `task.md`：354 字节，SHA-256 `1eeb624052bfd441c5f8cf00d71328771f280e2dcee333a3703c647b8cae177d`
  - `data.json`：161 字节，SHA-256 `e19841dff0bcdbca7ccb67bcf3f69a205b178b1033b2e08742d1228a582399be`

## 3. 首次失败与修正（如实记录）

第一次以 commit `2eb3c14320348686dc10683f34d5aa8dcbb86520` 回读时返回 `GIT_POINTER_NOT_FOUND`（404），未判成功。根因是 POC build 把 root 错给 `D:/AIEO/phase0/poc-material`，导致 manifest 文件项缺少仓库根前缀。契约要求文件项是**仓库根相对 POSIX 路径**。随后以 `D:/AIEO` 为 root 重建 manifest 并提交新 commit `26ed310`，读取成功。读取器语义未改变；GitPointer 本地测试 21/21 通过。

## 4. 边界

- 这是公开仓库、两个文本文件、一次正常网络的 POC。
- 私有仓库权限、真实多文件部分缺失、网络退避耗尽和秘密泄露场景未做真实远程故障注入；对应负例由本地测试覆盖。
- 本 POC 不代表完整 M1 REST/数据库/ACK 已实现，也不代表真实 ChatGPT 多 assistant unit/动态裁切已实测。
