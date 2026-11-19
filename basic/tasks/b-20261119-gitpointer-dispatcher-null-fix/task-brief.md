# 任务书：b-20261119-gitpointer-dispatcher-null-fix（GitPointer dispatcher:null 生产路径缺陷修复）

- 任务ID：b-20261119-gitpointer-dispatcher-null-fix
- 日期：2026-11-19
- 状态：草案 v0.1（待规划协商 R1 复审后冻结）

## 版本选型
- 选定版本：Basic 工作流 v0.3
- 任务等级：S2（公共工具缺陷修复+双环境验证；不触 DEC-010、不部署、不合并 main）
- 选型理由：修复点单一（fetch 调用入参 null 归一），有既有单测契约可守；不引入新架构、不改变对外 API 语义；风险评估归 Basic。
- 批准人/日期：用户本人（节点自主推进授权，用户 2026-11-19 "你继续接棒"/"请按照AIEO开发经验来"）；拍板委托 ChatGPT 派单渠道（DEC-010 红线除外）。

## 需求原文（用户原话，不加工）
见 requirement.md。

## 执行者理解（与原文分开）
- 缺陷根因：`phase0/tools/git_pointer.mjs:344` `createGitPointerProxyDispatcher()` 在无代理 env 返回 `null`；经 `:466` 传入 `fetchGitPointerBytes` 的 `dispatcher`，在 `:397` 作为 `fetch(url,{dispatcher})` 的 init 字段。Node v24.14.0 的 undici 对 `dispatcher:null` 抛内部 `ERR_ASSERTION` → `readGitPointer` 材料读取必失败（④-D 驱动首轮实证，L-017 教材现场）。
- 修复口径（草案，待 ChatGPT 复审）：在 fetch 调用处把 `dispatcher:null` 归一为 `undefined`（undici 省略该字段走默认 dispatcher），**不改** `createGitPointerProxyDispatcher` 的返回契约（既有单测"无代理返回 null"保持 PASS）。候选最小改法：`:397` 用 `dispatcher: dispatcher ?? undefined`（等价 `dispatcher || undefined`），或 `:466` 传参处归一——由规划协商裁定落点。
- 影响面：`phase0/tools/git_pointer.mjs` 为公共工具唯一权威源码（WORKFLOW「引用不复制」），修复后 `app/gpt_controller/src/git_pointer.mjs` 不引入 dispatcher（其文件头已声明不引入 undici dispatcher），无需改动；本任务只改 phase0 权威源码。

## 验收目标（最终要实现什么）
- 无代理 env 下 `readGitPointer` 材料读取不再抛 `ERR_ASSERTION`，能走通（注入式本地响应 + Node v24 真实 fetch 语义）；有代理 env 行为不变（仍经 EnvHttpProxyAgent）。
- 既有 21 项 GitPointer 单测全部保持 PASS，且**新增回归用例**覆盖"无代理 env + dispatcher 归一后 fetch 不被传 null"的正反断言。
- 双环境验证：无代理/有代理两种 env 下读取路径均有机器证据；不访问真实 GitHub；不改对外 API 语义/错误码。

## 落点登记
- 目标仓库：github.com/damwate/AIEO（本地 D:\AIEO），分支 main（基线=开工前登记完整 SHA，ST-01）
- 被测/修改文件：`phase0/tools/git_pointer.mjs`（唯一权威源码）；回归测试 `phase0/tools/test_git_pointer.mjs`
- 证据落点：`phase0/logs/`（派单/验证现场独立目录，跟踪惯例入库）

## 修复方案（草案，待冻结）
1. 最小归一：在 `fetchGitPointerBytes` 的 fetch init 构造处 `dispatcher: dispatcher ?? undefined`（落点二选一由 R1 裁定）。
2. 保持 `createGitPointerProxyDispatcher` 返回 null 的既有契约不变（单测"无代理 env 返回 null"不动）。
3. 新增回归断言：无代理 env 下 `readGitPointer` 走 fetch 时 opts.dispatcher 为 undefined（非 null）；注入 fetchImpl 捕获 opts 断言。
4. 双环境实测：无代理（清 env 中六个代理键）与有代理（注入 HTTPS_PROXY）分别跑注入式读取+真实 Node fetch 语义（不连真实 GitHub）。

## 边界（红线）
- 不触 DEC-010（无 main 合并/生产发布/真实数据删除）；不部署、不发布。
- 不改 `app/gpt_controller/src/git_pointer.mjs`（其不引入 dispatcher，无此缺陷）；不改对外 API 语义与错误码。
- 不访问真实 GitHub；单测沿用注入式本地响应（network_scope=INJECTED_ONLY）。
- 会话迁移：审查会话 6afdffa2 已承载 7 条 user 消息（超 L-018 §6 的 4 条评估阈值），本任务规划协商迁新会话。

## 优先级
普通（但为生产路径缺陷，下一节点优先推进）

## 任务状态（随进度更新）
| 字段 | 值 |
|---|---|
| 当前状态 | 待规划 |
| 当前步骤 | S1 登记完成，待 R1 规划协商派单 |
