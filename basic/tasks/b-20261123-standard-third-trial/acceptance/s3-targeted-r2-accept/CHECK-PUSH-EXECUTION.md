# check-push 真实执行输出归档（seq11 前置 push）

> 用途：codex 指出「远端推送结果已验证，check-push 的具体代理路径仍是执行者报告」。本文件把两次 `node toolkit/check-push.mjs --push --yes` 的**工具输出逐字转录**归档，供独立核验。执行均在 worktree `D:\AIEO\.worktrees\feat-standard-task-management`，只推 `feat/standard-task-management → origin/feat/standard-task-management`，未触碰 main。输出中 URL 已由工具自身 `maskUrl` 处理。

## 第一次推送（补证提交 `7cc4fc1…`，2026-11-24 约 17:46 +0800）

```
[check-push] 仓库=D:/AIEO/.worktrees/feat-standard-task-management
[check-push] 分支=feat/standard-task-management 上游=origin/feat/standard-task-management ahead=2 behind=0 remote=https://github.com/damwate/AIEO.git
[check-push] 代理配置(只读) http.https://github.com.proxy = http://127.0.0.1:6822
[check-push] 代理配置(只读) http.proxy = http://127.0.0.1:6822
[check-push] 注册表 ProxyServer 发现：state=ok preferred=1080（per-protocol）
[check-push] 候选队列（发现序：直连→注册表→git config→env/--ports→netstat 末位）：1080, 6822, 1031, 1032, 1856, 2179, 3389, 5040
[check-push]   1080 ← 来源: 注册表ProxyServer(http+https+socks) + netstat
[check-push]   6822 ← 来源: git config http.https://github.com.proxy + git config http.proxy
[check-push] ① 直连 dry-run（绕过仓库代理，超时 30s）…
[check-push] [直连（绕过仓库代理）] FAIL（21249ms）stderr=fatal: unable to access 'https://github.com/damwate/AIEO.git/': Recv failure: Connection was reset
[check-push] [代理 127.0.0.1:1080（来源: 注册表ProxyServer(http+https+socks)+netstat）] OK（4207ms）

===== check-push 结果 =====
操作：push feat/standard-task-management → origin/feat/standard-task-management（ahead=2）【真实推送】
路径 直连（绕过仓库代理）：FAIL | fatal: unable to access 'https://github.com/damwate/AIEO.git/': Recv failure: Connection was reset
路径 代理 127.0.0.1:1080（来源: 注册表ProxyServer(http+https+socks)+netstat）：OK
可用路径：代理 127.0.0.1:1080（来源: 注册表ProxyServer(http+https+socks)+netstat）
真实推送命令：git -c http.proxy=http://127.0.0.1:1080 -c http.https://github.com/damwate/AIEO.git.proxy=http://127.0.0.1:1080 push   （使用端口 1080，来源: 代理 127.0.0.1:1080（来源: 注册表ProxyServer(http+https+socks)+netstat））
[check-push] 推送成功（端口 1080）。复核：ahead=0 behind=0
```

## 第二次推送（修正提交 `ee91c180` + `e412346`，约 18:03 +0800）

```
操作：push feat/standard-task-management → origin/feat/standard-task-management（ahead=2）【真实推送】
路径 直连（绕过仓库代理）：FAIL | fatal: unable to access 'https://github.com/damwate/AIEO.git/': Recv failure: Connection was reset
路径 代理 127.0.0.1:1080（来源: 注册表ProxyServer(http+https+socks)+netstat）：OK
可用路径：代理 127.0.0.1:1080（来源: 注册表ProxyServer(http+https+socks)+netstat）
真实推送命令：git -c http.proxy=http://127.0.0.1:1080 -c http.https://github.com/damwate/AIEO.git.proxy=http://127.0.0.1:1080 push   （使用端口 1080）
[check-push] 推送成功（端口 1080）。复核：ahead=0 behind=0
```

## 第三次推送（能力整理 `5c6f72d`，约 18:06 +0800）

```
操作：push feat/standard-task-management → origin/feat/standard-task-management（ahead=1）【真实推送】
路径 直连（绕过仓库代理）：FAIL | fatal: unable to access 'https://github.com/damwate/AIEO.git/': Failed to connect to github.com port 443 after 21086 ms: Could not connect to server
路径 代理 127.0.0.1:1080（来源: 注册表ProxyServer(http+https+socks)+netstat）：OK
可用路径：代理 127.0.0.1:1080（来源: 注册表ProxyServer(http+https+socks)+netstat）
真实推送命令：git -c http.proxy=http://127.0.0.1:1080 -c http.https://github.com/damwate/AIEO.git.proxy=http://127.0.0.1:1080 push   （使用端口 1080）
[check-push] 推送成功（端口 1080）。复核：ahead=0 behind=0
```

> 三次均为 L-014 固化处置：直连失败→注册表发现活代理 1080→TCP 预筛 + git dry-run 验证→真实推送；工具严格只读、不改写 git config / 系统代理。

## 第四次推送（补齐 codex 核验缺项 `523d080`，约 18:12 +0800）

```
操作：push feat/standard-task-management → origin/feat/standard-task-management（ahead=1）【真实推送】
路径 直连（绕过仓库代理）：OK
可用路径：直连（绕过仓库代理）
真实推送命令：git -c http.proxy= -c http.https://github.com/damwate/AIEO.git.proxy= push   （使用端口 （直连））
[check-push] 推送成功（端口 直连）。复核：ahead=0 behind=0
```

> 本次直连可用（网络恢复），无需代理；与 L-014「候选按每次实测判定、不写死端口」一致。
