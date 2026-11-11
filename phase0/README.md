# AIEO Phase 0 技术验证

**分支：** `feature/AIEO-PHASE0-POC`（不合并 main，等待 GPT 独立审查）
**执行角色：** 智谱（ZCode）
**日期：** 2026-11-12

## 目录

```text
phase0/
├── README.md                    <- 本文件
├── environment-inventory.md     <- P0-001 环境盘点（含代理网络结论）
├── zcode-mcp-poc/               <- POC-01 AIEO MCP Server（server.mjs + 冒烟测试）
├── zcode-trigger-poc.md?        <- POC-02 说明见 reports/zcode-trigger-validation.md（验证脚本为一条 CLI 命令，无独立代码文件）
├── gpt-browser-poc/             <- POC-03 Playwright GPT 浏览器控制器
├── git-poc/                     <- POC-04 Git 自动采集（git_collect.py）
├── e2e-poc/                     <- POC-05 端到端工作区（外部会话产出）
├── reports/                     <- 各项验证报告 + 最终报告
├── logs/                        <- 真实运行日志与结构化证据
└── screenshots/                 <- POC-03 浏览器截图等
```

## 快速复现

```bash
# POC-04 Git 自动采集
python -I phase0/git-poc/git_collect.py

# POC-01 MCP 冒烟测试
python -I phase0/zcode-mcp-poc/smoke_test.py

# POC-02 外部启动（MCP 已配置在 ~/.zcode/cli/config.json）
node "D:\Program Files\ZCode\resources\glm\zcode.cjs" --prompt "<任务>" --cwd "D:\AIEO" --json

# POC-03 GPT 浏览器往返（需先手动登录一次）
cd phase0/gpt-browser-poc && node gpt_roundtrip.mjs --setup   # 首次：打开浏览器等待人工登录
node gpt_roundtrip.mjs --run                                  # 之后：自动收发验证
```

## 结论速览

| POC | 结论 | 报告 |
|---|---|---|
| POC-01 MCP | ✅ PASS | reports/mcp-validation.md |
| POC-02 外部启动 | ✅ PASS_WITH_CONSTRAINTS（外部取消无受支持接口） | reports/zcode-trigger-validation.md |
| POC-03 GPT 浏览器 | 见 reports/gpt-browser-validation.md | — |
| POC-04 Git 采集 | ✅ PASS（9/9 步） | reports/git-validation.md |
| POC-05 端到端 | 见 reports/phase0-final-report.md | — |
