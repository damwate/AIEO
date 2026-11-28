# R6 授权重跑报告：装配修复生效，4/5 卡在 qywx fixture 缺失（b-20261127-bms-production-triage/P1 任务1）

## 授权边界执行情况

仅改一处：`WebEnvironment.NONE` → `WebEnvironment.MOCK`（MultiDeviceLoginIntegrationTest 注解，
含说明注释）。业务代码/生产配置/测试逻辑/运行脚本零改动；未增删测试；原命令
`python -I runtime/run_acl_tests.py` 重跑；完整日志/退出码/Surefire/pre-post 基线已留存。

## 运行结果（2026-11-28T12:44:41+08:00，退出码=1）

- 上下文加载：**成功**（装配修复生效，"No ServletContext set" 消失）。
- `accountTokensCoexistAndLogoutOnlyRevokesCurrentToken`：**PASS**（真实端到端：双登录共
  存、单 token 登出仅吊销当前 token、过期校验）。
- `UserTokenTest`（entity 包单元测试）：PASS。
- 4 项 qywx 测试 FAIL，同一根因：`findQywxBoundUser` 前置断言失败——dev 库无
  `qywx_user_id` 已绑定用户。**被测业务逻辑与并发清理逻辑未执行**（fixture 查找即拦截，
  属测试数据前置条件缺失，非装配错误、非业务断言失败、非清理逻辑异常）。
- 佐证：dev 库 `user` 表 180 个用户，`qywx_user_id` 绑定数=0（列存在）——
  dev-user-qywx-check.json。

## 数据库基线变化（逐项说明，不宣称零污染）

pre → post：测试用户 token 778→780（+2），活跃 1→1（不变）；全表 2827→2829（+2），活跃 23→23（不变）。
+2 行逐项：均为 2026-11-28 12:44:41（测试运行分钟）创建、app_id=app101、
**is_deleted=1（已逻辑删除）**——即 PASS 测试的两次登录各创建 1 个 token：
1 个被测试内 logout 步骤吊销，1 个被 @After 兜底清理吊销。现有行零变化、零消失。
清理纪律（测试创建的 token 全部吊销、无活跃残留）按设计生效。

## 待裁定事项

4 项 qywx 测试需要 fixture：dev 库一个 `qywx_user_id` 非空用户（仅被读取，qywx 登录链路中
workWechatService 为 MockBean）。请授权其一：
A. 一次性 INSERT fixture 用户（指定 qywx_user_id 与最小字段；测试后按既有逻辑删除方式清理，
   不物理 DELETE）；
B. 授权修改测试自行创建/清理 fixture（属测试代码变更，需新审查轮）。

材料=本目录 9 文件+MANIFEST+zip（SHA 见 MANIFEST）。
