# 任务1 本地分析：AI-Image-Service 白图/未加载完输入识别能力

基线：`0c53c963d93e33c15ebd4498742828fcf9ffc57d`（2026-11-22）＋ 生产实况 share.yotin.com.cn（容器 ai-image-service-api-1 / db）

## A. 传给供应商的参数现状（用户记忆核对）

| 项 | 事实 | 证据 |
|---|---|---|
| 参数机制 | **配置驱动**：size/quality/output_format 取通道配置 `cfg.get('size') or 'auto'`，自 2026-10-16 起 | `backend/app/ai/ai_provider_openai.py:344,355-356,662-663,749-750`；表单字段清单 `:18` |
| 请求方可传 | size 显式传 `auto` 或 `宽x高`（正则校验），quality auto/low/medium/high | `backend/app/ai/generic_params.py:10-14,46-51` |
| 生产实况 | 活跃通道全部 `size="1024x1024"`（gpt-image-2.6-sunburst 主通道 quality="low" png；2.5 有一路 auto；gpt-image-2 同 1024x1024） | 服务器 `/run/secrets/ai-provider.json`（2026-11-22 实读） |
| 来源 app 实况 | garden-design-calculator 提交仅 `{"n": 1}`，size 未传→落配置 1024x1024 | 生产库 generic_image_jobs.params_json（jobs.json 采证） |

**结论：用户记忆"最低1K"应校正为"当前生产配置固定 1024×1024"**——不存在"下限"逻辑；另有 `QUALITY_MIN_EDGE_PX=1024` 是评估工具画质代理线（`evaluation.py:40`），与"1K"记忆可能同源但语义不同（评估非请求）。

## B. 白图/未加载完输入能否识别？——**不能**

输入链四环逐一核对，全部只做"结构完整性"，零内容级检测：

1. **上传校验**：`storage.py:252` PIL decode + 每边 ≤8192px（`MEDIA_MAX_EDGE_PX`）；字节 ≤20MB（`storage.py:49`）；mime 白名单——只证明"是张能解码的图"。
2. **入库**：`input_images_json={images:[{slot,storage_key,sha256,mime}]}`。
3. **worker 装载**：`job_spec.py:82-118 load_inputs`——sha256 逐字节校验 + slot 1..N 连续。sha256 只证明「和上传时一致」（完整性），**不证明「内容有效」**（白图原样上传也校验通过）。
4. **发供应商**：multipart 表单直发（`ai_provider_openai.py`），无内容检查。

**唯一的空白检测代码不在生产链**：`evaluation.py:235-251 _validity`（魔数白名单+可解析+灰度 extrema `hi-lo<8` 判纯色空白）仅用于评估数据集跑分（调用方=`cli.py:179`、`admin_api.py:32`，即人工触发的供应商基准评估 run），生产 worker/提交路径零调用。

**且现有算法抓不住本次案例**：白板是**部分区域**白色（原图大部分有内容），整图灰度 extrema 差值远大于 8，"纯色空白"判定必然放过。服务器实况：两任务输入 1988×1091 / 2490×1256 原图直上，sha256 全过，白块随图进入供应商。

## C. 因果链（三任务共享的事实基座）

GDC 前端从服务器加载原图（纹理/素材）**未等 load 完成** → canvas 截图/合成出白块 → 上传（AISVC 无内容检测放行）→ AI 对白块区域瞎编 → 结果图错误。

## D. 方案候选（提交 ChatGPT 讨论的雏形）

1. **上游治本（GDC 侧，对应任务2/3）**：上传/截图前置门禁——`img.complete && naturalWidth>0` + `await img.decode()`；加载失败重试；未完成禁止提交。
2. **输入端软检测（AISVC 侧）**：领取/发送前块级检测（如 N×N 块内灰度 stddev≈0 且均值≈255 的"死白块"占比超阈值 → 告警/拒绝）。**误杀风险高**：线稿/平面图本来有大留白，硬拒绝会挡正常业务 → 建议先告警（provider_attempts 或 job 时间线记 flag）观察。
3. **复用增强 `_validity`**：extrema 思想升级为分块版，同时用于**输出图**（AI 瞎编白块同样该拦）。
4. 参数面无需动（用户也确认"这个倒是没啥"）。

## 待 ChatGPT 讨论的问题

1. 输入白块检测的阈值/算法选择（块级 stddev vs 白像素占比 vs 边缘密度），如何区分「未加载白块」与「设计留白」？
2. 拦截策略：硬拒（422）vs 告警放行 vs 仅上游拦截，哪个优先？
3. 输出端是否同步加同款检测？
