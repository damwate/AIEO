# 契约绑定登记（S3-④-D 专项，R2/R3 裁定条件：契约原文路径+完整 SHA+§2.6.6/§2.6.7 摘录+被测源码 SHA）

- **登记时间：** 2026-11-19（S3-④-D 执行前，ST-01 契约-实现绑定）
- **契约原文：** `docs/phase1/platform-contract-v1.0.md`
  - Git blob SHA-1：`31cf7a4f58f6e6ba7da202cee55d89e123f36037`
  - SHA-256：`31890dff1a16923b712a6a2899b5d120dd48cd57e222382e99b1921d4268e7ff`
- **被测源码：** `phase0/tools/git_pointer.mjs`
  - Git blob SHA-1：`992b34a27d69a6570b5ef02ee2c377ccb1b2207f`
  - SHA-256：`760284696b6152b9246909830b9fa70bb6f1b1a0eb44664b4b91b12870664b28`
  - 关键行：40-48 默认 maxRetries=3/基间隔 2s/超时 30s；374-377 指数退避±20% 抖动；391-409 网络异常 4 次尝试+attempts 留证+`GIT_POINTER_NETWORK_RETRY_EXHAUSTED`；411-420 暂时性 HTTP 有限重试+`GIT_POINTER_HTTP_RETRY_EXHAUSTED`；422+ 非 404/410 等非瞬态不重试（404 → `GIT_POINTER_NOT_FOUND`，错误语内嵌"不得回退分支 HEAD 或相似路径"）

## §2.6.6 原文摘录（第 250-251 行，大小、文件数、重试与超时配置表）

> | `AIEO_GIT_POINTER_HTTP_MAX_RETRIES` | git_pointer.http_max_retries | `3` | 暂时性 GitHub 访问失败在首次请求后的最大重试次数，即最多 4 次尝试 |
> | `AIEO_GIT_POINTER_HTTP_RETRY_BASE_SECONDS` | git_pointer.http_retry_base_seconds | `2` | GitHub 暂时性失败的指数退避基间隔，倍率 2、±20% 抖动 |

## §2.6.7 原文摘录（第 276 行，网络故障处置表）

> | 仓库暂时不可达、连接/超时/重置或 GitHub 502/503/504 | 按 §2.6.6 做有限指数退避；耗尽后 BLOCKED，保留任务与材料 commit | 不得无限重试或误判为 GPT 未完成；网络恢复后从读取预检继续 |

（§2.6.7 第 292 行附加语义：除明确允许的暂时网络退避外，权限/不存在/SHA/路径等错误均**不可自动降级、不可自动换源**——⑤ 两子例实测该语义成立。）

## 绑定结论

- ④-D1（连接拒绝耗尽）/④-D2（503 耗尽）实测行为与上述契约条款**一致**（4 次尝试/3 次退避/双耗尽错误码/attempts 逐次留证/无降级无换源无 HEAD 回退）。
- 实测退避窗口（默认配置，单调时钟实测）：第 1 次 1.6-2.4s、第 2 次 3.2-4.8s、第 3 次 6.4-9.6s——与"基间隔 2s、倍率 2、±20% 抖动"一致。
