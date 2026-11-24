# 原始日志 → UTF-8 副本 SHA256 对照表（本步骤补证）

> 原始日志保留在 `acceptance/test-logs/`，UTF-8 副本在 `acceptance/s3-supplement/`。原始日志为混合编码（UTF-8 头 + UTF-16 LE 正文），副本统一为 UTF-8（无 BOM），正文逐字重编码、未改内容；每份副本头部含 `Source SHA256` 与 `Source` 路径标注来源。

| 项目 | 原始日志 | 原始日志 SHA256 | UTF-8 副本 | UTF-8 副本 SHA256 | 被测 SHA |
|---|---|---|---|---|---|
| GDC 145/2 | `test-logs/gdc-90ce2233-r3.log` | `34f2b71f68e3b0d4ff3d0a423e84491b30587fed40246dfae699d771bb2975db` | `s3-supplement/gdc-90ce2233-r3.utf8.log` | `f9da9ebfc92d60abcef559fa44dee9ce0196ca05712ea21aeaf0d3eacfac52ea` | `90ce2233b4da9d844cf1e165c43cec2ecdd3cddd` |
| AIS 78 | `test-logs/ais-a1f55b52-r3.log` | `ebc0b9389ff7ef6131ff7f14f97ebf1c39cbc85c943a47a714d3cec19fb24170` | `s3-supplement/ais-a1f55b52-r3.utf8.log` | `0f0a43fa506e04c15014a92d87fc6be2605c56945c418705ec4e66250da73fd0` | `a1f55b523f90763bcd12823bf52cff9d710381a6` |
| AIEO 队列 12 | `test-logs/aieo-queue-4d184e8-r3.log` | `76f4288c7f1b023f137f944b0fc937d12ef26c3e6dd2f30ffd7a81f249963e2f` | `s3-supplement/aieo-queue-4d184e8-r3.utf8.log` | `41af9ec74e0a2711e548acd8a4e6f65627e86b49760467b155e9d0ffbcfa5639` | `4d184e8de4eab56519c4e0f57a6e37afbc7984ac` |

注：Git Blob SHA（对象标识）≠ 文件内容的 SHA256；本表用的是对文件字节直接计算的 SHA-256，与审查方在提交树中读取的 Blob SHA 不是同一口径，不混用。
