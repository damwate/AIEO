# 任务书：AI-Image-Service F3终审REWORK整改（承接CodeBuddy）

- 任务ID：b-20261119-aisvc-f3-rework
- 日期：2026-11-19
- **版本选型：**
  - 选定版本：Basic
  - 任务等级：S2
  - 选型理由：涉业务代码修改但范围小（1个中止teardown修复+2个测试文件重写/强化），方案=ChatGPT终审required_fix清单外部给定，风险可控→Basic。
  - 批准人/日期：用户拍板，2026-11-19（用户指令原文见 requirement.md；方案依据=上轮ChatGPT终审reply b786a75e…的 findings/required_fix）

## 需求原文（用户原话，不加工）

见 requirement.md。

## 执行者理解（与原文分开，便于对账）

- CodeBuddy 下线，由本会话承接 AI-Image-Service REWORK 整改（上轮裁定 reply SHA=b786a75e2987a2ff02b63548677783d1152c6d15e1567b15eeb0d4462aec2fee）：F3 四项 required_fix + F2/F4 约束项同批；完成后以新会话派 ChatGPT 终审复审。

## 落点登记（WORKFLOW 增补④§二）

- 目标仓库：github.com/YotinGarden/AI-Image-Service（本地 D:\YotinGarden\AI-Image-Service）
- 目标分支：fix/yuanqiao-http1-20261117（基线 47f2ecc1f17f51cc1cbb2e326602f9447ed3407e）
- 允许修改：backend/tests/test_real_stream_transport.py、backend/tests/test_migrations_baseline.py、backend/app/ai/http_transport.py（F2注记+中止teardown）

## 验收目标（最终要实现什么）

- 上轮 REWORK 全部 findings 有对应修复且本地实测通过（目标文件全绿+全量无新增失败）；整改 commit 推送远端后经新会话派 ChatGPT 复审，reply 归档登记。

## 优先级：普通

## 任务状态（随进度更新）

| 字段 | 值 |
|---|---|
| 当前状态 | 完成 |
| 当前步骤 | （无） |
| 最终结果 | PASS（整改+复审闭环；ChatGPT R3 终局 PASS 绑定 d50ce91） |

## 步骤清单（用户直接指令+ChatGPT required_fix 拍板，2026-11-19 冻结）

1. S1 整改实现与本地验证（F3四项+F2 teardown/注记+F4全比对；实测通过；commit+push）
2. S2 新会话派复审简报（≤1200B自包含）→采集裁定→归档登记
