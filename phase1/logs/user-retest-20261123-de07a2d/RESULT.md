# AIEO 标准版（M1–M4）本轮回归汇总 — 用户请求复测

**被测 commit：** `de07a2d55381d00ea9aefb49e601a8dd5d586561`（main 当前 HEAD，用户 2026-11-23 "再做一轮测试" 请求）
**时间：** 2026-11-23（UTC）
**环境：** Python 3.12.10（pytest 8.3.5 / fastapi 0.115.12 / httpx / argon2 全局可用）；Node v24.14.0；三个 Node 模块 node_modules 已就绪；Git 正常。
**证据目录：** 本目录（各模块 stdout/stderr 日志 + `.exit` 退出码 + `TESTED_SHA.txt`）；集成证据 `phase1/logs/integration-20261123T042534Z/`。

## 结果（全部真实执行，退出码见同目录 .exit 文件）

| 模块 | 命令 | 结果 | 退出码 |
|---|---|---|---|
| M1 平台基座 | `python -m pytest tests/platform app/platform/tests -q` | 43 passed | 0 |
| M2 GPT 控制器 | `node --test tests/unit.test.mjs tests/browser_simulation.test.mjs tests/lock_mutex.test.mjs`（cwd app/gpt_controller） | 65 pass / 0 fail | 0 |
| M3 ZCode Bridge | `node --test test/*.test.mjs`（cwd app/zcode_bridge） | 53 pass / 0 fail | 0 |
| M4 Git Worker | `python -m pytest app/git_worker/tests -q` | 24 passed | 0 |
| 集成 E2E | `python tests/integration/e2e_four_modules.py` | 11 步 all_ok=True | 0 |

合计：单元/回归 185 用例全过，集成 11/11 步全过。E2E 为真实 uvicorn 子进程 + 真实 MCP stdio + 真实 GitWorker + 真实 scratch git 仓库 + M2 headless 全管线（本地 DOM fixture，不连 chatgpt.com）。

## 边界（如实登记，避免扩大解释）

- 本轮仅重跑现有自动化测试，被测 commit `de07a2d` 含会话上下文预算管理（R8 合并成果），但 M2 的 `app/gpt_controller/src/` 测试套件不覆盖 `phase0/tools/gpt_dispatch.mjs` 的预算门控——后者由独立验收 CTX-CODE-R8 3/3 PASS 覆盖（见 `basic/tasks/b-20261122-session-ctx-mgmt/steps.md`）。
- E2E 的 M2 腿是本地 DOM fixture，不是真实 ChatGPT 网页；DEC-017 扩展场景（真实多 assistant unit、动态虚拟列表裁切、私有仓库权限、网络故障注入、M1 完整 REST/DB 服务闭环、平台级并发 906⑥）仍 BLOCKED，本轮测试不构成其解除证据。
- 本轮不构成生产发布授权；仅验证"当前 main 的自动化测试全绿"。
