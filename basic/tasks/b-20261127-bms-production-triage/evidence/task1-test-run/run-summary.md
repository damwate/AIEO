# R6 授权测试运行报告：环境级失败诊断（b-20261127-bms-production-triage/P1 任务1）

## 运行事实

- 命令：`python -I runtime/run_acl_tests.py`（既有脚本，仅加载 ACL_ADMIN_* 凭证执行已复核的
  `-Dtest=UserTokenTest,MultiDeviceLoginIntegrationTest`）
- 时间：2026-11-28T12:38:49+08:00；退出码=1（exit-code.txt）；完整日志=acl-test-run.log
- 结果：UserTokenTest（entity 包，纯单元测试）**1 run 0 failures PASS**；
  MultiDeviceLoginIntegrationTest **5 run 0 failures 5 errors**——全部在
  ApplicationContext 加载阶段失败，被测业务逻辑与并发清理逻辑一行未执行。

## 根因诊断（环境/测试装配失败，非代码失败）

- 错误链：`resourceHandlerMapping` → `No ServletContext set`。
- 机制：业务配置类 `SpringMvcConfiguration extends WebMvcConfigurationSupport`（servlet MVC 配置，
  无条件注册 `resourceHandlerMapping`，需要 ServletContext）与测试注解
  `@SpringBootTest(..., webEnvironment = WebEnvironment.NONE, ...)` 不兼容——NONE 模式不创建
  ServletContext，上下文加载即失败。
- 佐证：P0 阶段同一应用以 web 方式启动 dev 服务正常（start_p0_dev.ps1）；失败与 R6 复核的
  awaitWorkersTermination 两阶段逻辑无关；5 个 error 同一根因，均在 MockitoTestExecutionListener
  准备测试实例前的上下文加载。

## 数据库基线（测试纪律第3条，R6 授权要求）

| 指标 | pre | post | 结论 |
|---|---|---|---|
| 测试用户(id=40) token 总数 | 778 | 778 | 无新增 |
| 测试用户活跃 token | 1 | 1 | 基线保留 |
| 全表总数/活跃 | 2827/23 | 2827/23 | **零污染** |

pre/post 快照逐字段一致（baseline-pre.json / baseline-post.json，token 值已脱敏）。

## 修复提案（待授权，未擅自实施）

最小修复=测试注解 `WebEnvironment.NONE` → `WebEnvironment.MOCK`（一个词，仅测试装配，
不启真实服务器，MockServletContext 满足 resourceHandlerMapping 实例化）。业务代码零改动。
授权后实施并重跑同一命令，再申请验收。

## 测试纪律执行情况

1. 只运行已复核测试 ✓（run_acl_tests.py 未改）
2. 完整日志/退出码/报告已留存 ✓
3. 测试前后基线已核 ✓（零污染）
4. 未修改任何业务代码 ✓；未扩大测试范围 ✓
5. 已区分：环境失败（测试装配），非代码失败 ✓
