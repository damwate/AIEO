# 2K 证据矩阵结果（220 实测，2026-11-24T03:12~03:19Z）

按 planning R3 裁定 MF-01/02 执行，成对留证（vendor/size/endpoint/HTTP/dims/耗时/错误体）。

## 一、generations 通道矩阵（gpt-image-2.6-sunburst）

| size 请求 | yuanqiao（api.yuanqiaoyun.com） | wukong（api.wukong.support） |
|---|---|---|
| 1024x1024 | **1024×1024** | 1254×1254 |
| 2048x2048 | **2048×2048** | **2048×2048** |
| 2K（档位串） | 1536×1024（**横图！**） | 2048×1872 |
| 不传 | 1254×1254 | 1254×1254 |
| auto | 1254×1254 | 1254×1254 |

## 二、wukong edits 通道（GDC 带图实际路径）

| 协议 | size | 结果 |
|---|---|---|
| multipart | 2048x2048 | **403**（网关 multipart 解析不到 model，adapter 注释早有记载） |
| multipart | 2K | **403** 同上 |
| **JSON+dataURI**（生产 edits_protocol=json 真实路径） | 2048x2048 | **2048×2048** |
| **JSON+dataURI** | 2K | **2048×2048** |

## 三、关键发现

1. **"2K" 档位串未被两家网关识别**：
   - yuanqiao 对 2K 回 1536×1024（横图）——与 2K 预期（约 2048×2048 或同长宽比放大）不符，疑被按未知串→上游默认（上游默认即 1536×1024=OpenAI gpt-image 横图缺省尺寸）；
   - wukong 对 2K 回 2048×1872（接近但≠2048×2048，长宽比漂移），同样非精确档位语义。
2. **像素串 2048x2048 是唯一在两家所有可用通道都产出精确 2048×2048 的写法**；1024x1024 在 wukong 被重映射 1254×1254（=其 auto 缺省），2048x2048 未被重映射。
3. 据此：**用户的"用 1K/2K/4K 档位参数"的认知与网关实测不符**——实测档位串反而是非确定行为，像素串才精确。这与 R3 裁定「档位参数≠请求参数≠输出像素」一致，只是实测把答案钉在了像素侧。

## 四、遗留风险与未完成项

- **billing 档位未验证**：远桥/悟空的计费档位不可见，「按 2K 计费还是按像素计费」无从直接确认。这一项按用户决定：若仅关心输出图≥2048 清晰度，现状已满足；若要按档位计费管理，需供应商后台核对（本矩阵提供不了）。
- vendor-d5b728b6 不在路由计划内（route_plan 三家为 vendor-38a26ea7/wukong/yuanqiao），本次未实测；其 base_url 与 yuanqiao 相同（gpt-image-2.5-sunburst），可参照 yuanqiao 结论但需独立确认（R3 要求不继承）。
- 1024x1024→1254×1254 的重映射机制未查明（疑 new-api 上游 1K 档位归一化），不影响本次结论。

## 五、处置选项（交用户拍板，DEC-010 生产变更须用户决定）

当前 220 生产=wukong/yuanqiao/d5b728b6 已配 2048x2048（第一版改动），intelalloc 保持 auto。

- **方案 A（维持现状，推荐）**：像素串 2048x2048 实测即 2K 输出，已满足"默认 2K"目标，零变更零风险。补一次服务级烟测确认即可闭环。
- **方案 B（改档位串 2K）**：实测证明错误（yuanqiao 出横图），**不建议**。
- **方案 C（回滚 1K）**：如需回退，`cp .bak-20261123` 即可。

## 六、服务级烟测与真根因（2026-11-24 补）

服务烟测（经 GDC api 容器以生产 X-API-Key 提交 playground 任务）：job `e3c27ba6-5403-4294-9f16-03e975faa38f` succeeded，**回图 1254×1254**，与直连 2048x2048→2048×2048 矛盾。

**真根因**：`AI-Image-Service/backend/app/ai/job_spec.py:128-131` 无条件覆盖 size——
```
for key in ('size','quality','output_format'):
    cfg.pop(key,None)
    if key in caps['supported_params']:
        cfg[key] = params.get(key, DEFAULT_PARAMS[key])  # DEFAULT_PARAMS.size='auto'
```
即：**per-request params 优先于供应商配置；params 未传 size 时一律落到 auto**，供应商配置里的 size 被 pop 后根本到不了出站请求。所以此前「改配置 size=2048x2048」对服务路径完全无效——这正是昨天两次烟测出内容自适应尺寸的机制。

**结论修正**：之前以为「2048x2048 非档位值所以无效」是误判——像素串本身精确有效（直连实测），只是被 job_spec 覆盖没机会出站。用户要的"默认 2K"须改 **GDC 提交 params**（`external_jobs.py:54` 的 `params={'n':1}` → 增 `size:'2048x2048'`），或在 AIS 侧改 DEFAULT_PARAMS.size。推荐 GDC 侧：不动 AIS 全局，且与本任务 R1 改动同仓同点。

**档位串 "2K" 的实测结论不变**：yuanqiao 出 1536×1024 横图，wukong 出 2048×1872，均非精确 2K；像素串 2048x2048 是唯一双供应商精确解。
