# 生图默认 1K→2K 修正方案（任务 b-20261123-standard-third-trial）

## 背景与根因

- 用户要求（2026-11-23）：「AI-IMAGE-SERVICE 效果图现在默认是 1K，改成默认 2K」。
- 生产配置（220 `/home/yotin/migration-221/files/home/yotin/AI-Image-Service/.env/ai-provider.json`，221 同构路径 `/home/yotin/AI-Image-Service/.env/ai-provider.json`）中 yuanqiao/wukong/vendor-d5b728b6 的 `size` 原为 `1024x1024`。
- **第一次修改（已被证伪）**：改成像素值 `2048x2048`。直调网关该值能字面生效（直调实测 2048×2048），但**走服务工作流的两笔烟测均回内容相关尺寸**（1448×1086、1312×1199）——与用户澄清矛盾。
- **用户澄清（2026-11-23）**：「1K,2K,4K 是供应商那边的参数，不是图片实际大小参数」——供应商网关认档位值 `1K/2K/4K`，`2048x2048` 不是档位参数，网关按缺省（内容自适应）处理。
- 代码侧核实：`ai_provider_openai.py` generations(:662)/edits(:355)/edits-json(:749) 三通道均透传 `cfg.size`；`responses` 通道(:328 `_responses_body`)不带 size（次要路径，wukong/yuanqiao channel=auto 无图时走 generations，不受影响）。**纯配置问题，无代码改动**。
- 旁证：`scripts/configure_ai_routing.py:43` 中 seedream 新节点默认即 `'2K'`——档位值是本仓库既有惯例。

## 修正内容

220 与 221 的 ai-provider.json：

| 供应商 | 原值 | 修正为 |
|---|---|---|
| wukong | 1024x1024 →（误改）2048x2048 | **2K** |
| yuanqiao | 1024x1024 →（误改）2048x2048 | **2K** |
| vendor-d5b728b6 | 1024x1024 →（误改）2048x2048 | **2K** |
| vendor-38a26ea7（intelalloc） | auto（未动） | auto 保持 |

- 配置热加载（mtime 感知 `_HOT_CACHE`，ai_provider.py:155,215-221），**无需重启容器**。
- `.bak-20261123`（改动前原始 1024x1024 状态的备份）保持不动，作为回滚基准。

## 执行（待 220/221 内网可达）

> **门禁（planning R3 裁定，reply SHA256=4bb41bc0…）：** apply-2k.sh **禁止直接执行**。
> 须先完成 MF-01~MF-04（见 R3-RULING.md）：分供应商档位证据矩阵（wukong/yuanqiao/d5b728b6 各自实测
> size ∈ {1024x1024, 2048x2048, "2K", 不传, auto}，通道分开）、请求/响应成对留证、计费档位确认；
> 按矩阵结果分供应商定 mode（pixel_size/size_tier/auto/omit），修订脚本后再执行。IntelAlloc 本次不动。

```bash
bash apply-2k.sh            # 门禁通过后，220/221 各执行一次
python3 verify-2k.py        # 宿主机执行（证据矩阵+服务烟测）
```

预期 verify 输出：每个非 auto 供应商 `size=2K -> dims ≈(2048, 2048)`；服务烟测 job 结果 `SMOKE OK dims=(2048±, 2048±)`。

## 回滚

```bash
# 220
cp /home/yotin/migration-221/files/home/yotin/AI-Image-Service/.env/ai-provider.json.bak-20261123 \
   /home/yotin/migration-221/files/home/yotin/AI-Image-Service/.env/ai-provider.json
# 221 同理（/home/yotin/AI-Image-Service/.env/ai-provider.json）
```

## 遗留/风险

- 220 公网 SSH 当前不通（share.yotin.com.cn:22 拒绝；内网 192.168.0.220 超时），待用户公司电脑连内网后执行或恢复我侧访问后由我执行。
- 221 的 AIS 容器栈 3 天前已停（Exited 0），本次仅同步配置，不作为验证环境。
- vendor-38a26ea7（intelalloc，size=auto）在路由首位且常 400（provider_rejected）——既有现象，与本次改动无关，但意味着每次任务先撞一次它再 failover，产生 ~1s 延迟；是否调整其优先级属另一议题，交用户决定。
