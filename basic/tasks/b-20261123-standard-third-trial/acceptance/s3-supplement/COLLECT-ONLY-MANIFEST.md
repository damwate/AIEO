# GDC 10 文件 / AIS 4 文件 collect-only 清单（本步骤补证）

> 用途：把原始日志头 `<10 target files>` / `<4 target files>` 占位符补齐为实际文件清单，并给出在**被测 SHA** 上实测 collect-only 的计数证据，供审查方独立核验。
> 实测环境：本机 `D:\Garden-Design-Calculator`（HEAD=90ce2233）、`D:\YotinGarden\AI-Image-Service`（HEAD=a1f55b52），即被测提交本身；全程 `--collect-only`，未运行测试、未访问生产、未调用真实供应商。

## GDC：10 个目标文件（被测 SHA `90ce2233b4da9d844cf1e165c43cec2ecdd3cddd`）

命令：
```
cd D:/Garden-Design-Calculator/src/backend
PYTHONPATH=.. python -m pytest --collect-only -q -p no:cacheprovider <下列 10 文件>
```

| # | 文件 | 备注 |
|---|---|---|
| 1 | tests/test_admin_ai_job_detail.py | |
| 2 | tests/test_external_ai_service.py | 含 legacy 回落回归 |
| 3 | tests/test_ai_prompt_config.py | |
| 4 | tests/test_d1_ai_people_prompt.py | |
| 5 | tests/test_b10_ai_reference.py | |
| 6 | tests/test_l2w3_ai_reference_selection.py | 含名称快照一致性回归 |
| 7 | tests/test_l2w1_ai_multiimage.py | |
| 8 | tests/test_product_constraints.py | R1 产品清单 |
| 9 | tests/test_domain_reset_w5_job_media_binding.py | |
| 10 | tests/test_ai_console_gateway.py | 网关目标套件 |

实测计数（本步骤）：
- 前 9 个文件：`123 tests collected`
- `tests/test_ai_console_gateway.py`：`24 tests collected`
- 合计 **147 = 145 passed + 2 skipped**，与原始日志 `gdc-90ce2233-r3.log` 结束行一致。
- 清单来源：`CODEX-HANDOFF.md` 第四节 GDC 测试命令（9 文件）+ 网关目标套件；按 collect-only 计数闭合到 147。

## AIS：4 个目标文件（被测 SHA `a1f55b523f90763bcd12823bf52cff9d710381a6`）

命令：
```
cd D:/YotinGarden/AI-Image-Service/backend
python -m pytest --collect-only -q -p no:cacheprovider <下列 4 文件>
```

| # | 文件 | 备注 |
|---|---|---|
| 1 | tests/test_project_auth_v1.py | 含 12 项非法输入 422 回归 |
| 2 | tests/test_generic_jobs_capabilities.py | |
| 3 | tests/test_admin_api.py | |
| 4 | tests/test_t07b_governance_audit.py | governance audit |

实测计数（本步骤）：**78 tests collected**，与原始日志 `ais-a1f55b52-r3.log` 结束行 `78 passed` 一致。
- 清单来源：`codex-r3-remediation.md` 第三节「AIS：test_project_auth_v1 + capabilities + admin API + governance audit」。

## 边界
- 上述 collect-only 是**清单闭合性证据**，不是重新执行 145/78 项测试；原始执行结果以三份原始日志为准。
- 未合并 main/dev、未生产发布、未付费验收；SQLite 迁移不等于 PostgreSQL 已演练。
