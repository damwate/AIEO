# S2 Gate2-R4 复评请求：b-20261115-standard-kickoff（只复核 R3-01）

> 依据 Gate2-R3 复评（reply sha256=9e8bd5c43fdc1a3af55a0b8a63c5bc7f72c5887ebfb0799403d1e6e52a0504ec，recoll-2026-11-15T13-23-46-826Z）："下一轮只检查 GET 四端点授权依据/POST 四端点授权依据/附录 B 与 §6 凭据边界一致性/8 端点与 ACK 排除未变"。

## 绑定申报（ST-01，C1 工具机器核验）

- **待验收对象（2 commit 线性申报）：** 基线=`276a3be46579bf3088ed1a51fe9bce5afa445e41`（Gate2-R3 已核验末 commit）→ `ba9853e`（R3 请求回填，**--backfill-note 声明不属验收 diff 范围**）→ **待验收 commit=`d0c2d92ea88017397753d2072bb28407b7684956`**（R3-01 修订）
- **绑定核验（工具机器输出原文）：** `check-binding.py --baseline 276a3be… --target d0c2d92… --count 2 --backfill-note "…"` → **PASS**（R1=2 ✓／R2 链 ✓／R5 回填识别 ✓）；numstat=22/0 请求文件（回填）＋**6/5 charter**（验收 diff 仅 charter）
- 本请求所在回填 commit 不属验收 diff 范围（ST-01 ④）。

## R3-01 整改对照

| 要求 | 修正落位（charter 附录 B 授权依据列 8 行统一） |
|---|---|
| GET 四端点授权依据 | 4 行改为"engine 独立本机服务身份（C7 §8.6）＋M1 只读权限白名单"（不再用"会话凭据"） |
| POST events | "engine 独立本机服务身份（C7 §8.6）；事件推进权限=§6 白名单（GIT_VALIDATE/PASS/REWORK），合法性由 M1 状态机最终裁定" |
| POST 登记 3 行 | "engine 独立本机服务身份（C7 §8.6）；登记权限=C5 契约" |
| 8 端点与 ACK 排除 | 未变（仍 8 端点，ACK 不在白名单） |

## 复验范围声明

- 只复核 R3-01（附录 B 授权依据列与 §6 凭据边界一致性＋8 端点/ACK 未变）；R2-02 及此前已过项不重审。

**回执格式：** R3-01 结论＋总结论（定稿认可/仍需修订＋清单）。
