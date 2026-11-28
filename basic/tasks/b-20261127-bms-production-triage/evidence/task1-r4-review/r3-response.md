# P1 实施复核 R3→R4 修订说明

审查现场：`phase0/logs/dispatch-2026-11-28T03-17-09/reply.txt`，SHA256=`876bff9439077f48a81dd2c624f299269d94d2a6e9aac6c984a783db9410efef`。R3=REWORK：附件zip SHA256+MANIFEST 29/29验证通过，五项（时间顺序/DATETIME容差、MySQL 1406测试、Cookie审计、逻辑删除证据、Git基线）PASS不推翻；两项修订=①R3-2并发测试InterruptedException分支清理竞态（唯一代码阻断）②补充deleteByUserId全仓调用审计。本轮只收敛这两项，业务代码零改动，测试仍未运行。

## R4-1 并发测试线程终止与清理状态分离（MultiDeviceLoginIntegrationTest.java）

按审查意见逐条落实：

1. **InterruptedException分支不再只shutdownNow**：抽出`awaitWorkersTermination(executor)`助手。中断路径进入"可重复响应中断但绝不放弃等待"的循环（`awaitTermination(1s)`循环至实际终止或60s宽限期截止，每次再中断仅记录并continue），等待实际终止后返回。
2. **恢复中断状态**：助手用finally在返回前`Thread.currentThread().interrupt()`恢复（多次中断只恢复一次）。
3. **第二次awaitTermination超时不抛断言**：正常路径与中断路径一律返回`boolean workersTerminated`，助手内部零JUnit断言，任何等待失败都不再打断后续流程。
4. **终止状态与清理状态分离**：finally顺序=等待线程实际终止→扫描登记该用户新增非基线token（交给@After清理）→**之后**才`fail("并发工作线程未在宽限期内终止…")`。即使线程未终止，登记也已先行完成，@After按登记清单清理；fail措辞明确"已尽力登记但无法确认清理完整"，不宣称清理完成。
5. 60s/30s宽限与`start.countDown()`语义不变；正常路径行为与R3版本一致。

## R4-2 deleteByUserId 全仓调用审计（evidence-deletebyuserid-audit.md）

- 全仓grep（--exclude-dir=target，全文件类型）仅2命中：接口声明`UserTokenService.java:23`+实现`UserTokenServiceImpl.java:38`，**调用者0个**。
- token服务全部使用点：`UserController:251/316/346`getById（getByToken/menu/config只读）、`UserController:670`deleteByToken（单token logout）、`AuthInterceptor:70`getById。`UserServiceImpl`（账密/企微登录）无任何token删除调用。
- 结论：登录、OAuth、logout均不经批量删除路径；方法按审查要求原样保留（零调用者历史遗留API），多会话生命周期仅由deleteByToken+30天有效期约束。

## 附加执行证据

`task1-r4-testcompile.log`=修订后test-compile BUILD SUCCESS（2026-11-28T11:29:44，仅编译未运行测试）。ACL业务源码5文件与R3包逐字节一致（本轮仅改测试文件）；UI diff未变化。测试全部NOT_RUN；未提交未推送；P0保持HOLD。
