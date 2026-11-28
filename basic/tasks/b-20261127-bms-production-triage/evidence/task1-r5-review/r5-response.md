# R5 修订说明：线程终止与清理顺序（b-20261127-bms-production-triage/P1 任务1）

## R4-1 唯一阻断的处置

R4 指出：awaitWorkersTermination() 在正常路径 90 秒、中断路径 60 秒超时后返回 false，
调用方仍会扫描 activeTokenIds 并进入 @After 清理，此时工作线程可能仍在提交事务，
扫描后新增的 token 逃过登记形成遗留数据。

## 修订方案：以实际终止为唯一完成条件（两阶段）

```java
private boolean awaitWorkersTermination(ExecutorService executor) {
    boolean interrupted = false;
    try {
        executor.shutdown();
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(WORKER_GRACE_SECONDS); // 90s
        while (System.nanoTime() < deadline) {                    // 第一阶段：宽限期内逐秒等待自然终止
            try {
                if (executor.awaitTermination(1, TimeUnit.SECONDS)) return true;
            } catch (InterruptedException ie) { interrupted = true; }  // 清除等待线程中断状态继续等
        }
        executor.shutdownNow();                                   // 第二阶段：仅中断请求，不代表终止
        while (!executor.isTerminated()) {                        // 不再设时限，等到实际终止
            try {
                executor.awaitTermination(1, TimeUnit.SECONDS);
            } catch (InterruptedException ie) { interrupted = true; }
        }
        return false;                                             // 已终止但超出宽限期
    } finally {
        if (interrupted) Thread.currentThread().interrupt();      // 恢复中断位
    }
}
```

## 终止与清理顺序保证（逐路径）

| 路径 | 返回值 | 返回前提 | 清理安全性 |
|---|---|---|---|
| 宽限期内自然终止 | true | executor.isTerminated()==true | 扫描时线程已死，无在途提交 |
| 宽限期满后强制中断终止 | false | 同上，shutdownNow 后无限等待 isTerminated() | 同上；false 仅表示超期，调用方先登记再 fail |
| 等待中被打断 | 不改变返回语义 | 中断仅记录、吞掉继续等，绝不以中断冒充终止 | 同上 |

- **不存在返回 false 后照常清理的路径**：false 返回时 isTerminated() 已确认，
  因此调用方 `activeTokenIds(userId)` 扫描与 @After 清理开始时，任何工作线程都不可能再提交 token。
- **扫描登记先于 fail**：调用方 finally 顺序 = 等待终止 → 登记全部非基线 token → 才 fail；
  JUnit 的 @After 在 fail 后执行，登记集合完整覆盖测试期间产生的全部 token。
- **助手零 JUnit 断言**：仅返回 boolean，终止状态与清理状态分离（R3/R4 要求延续）。
- **中断位恢复保留**：吞中断仅记录，finally 恢复 Thread.currentThread().interrupt()。
- **超时处理策略**：宽限期（WORKER_GRACE_SECONDS=90s）满后 shutdownNow 是"请求中断"，
  真正的保证来自其后**不限时的 isTerminated() 等待**——宁可测试挂起也不在存活的线程面前开始清理
  （审查方原文："以实际线程终止为完成条件，不以时间到期冒充完成"）。

## 边界说明

- 极端情形（线程对 interrupt 无响应且永不终止）下助手不返回，测试挂起而非污染数据——
  这是本修订的明确取舍：数据完整性优先于测试可结束性；dev 环境登录插入为毫秒级操作，
  90s 宽限期 + 强制中断后仍不终止属环境级故障，应人工介入而非静默遗留脏数据。
- R4-2（deleteByUserId 审计）已 PASS，本轮零改动；ACL 业务代码（5 文件 diff）与 R4 完全一致，零新增修改。

## 交付物

1. acl-MultiDeviceLoginIntegrationTest.java = 修改后完整并发测试源码
2. task1-acl-uncommitted.diff = 对应 diff（6 文件：5 业务文件与 R4 一致 + 测试文件整文件新增，intent-to-add 生成后已还原索引）
3. 本文件 = 线程终止与清理顺序说明
4. task1-r5-testcompile.log = test-compile BUILD SUCCESS（mvn -pl acl-server -am test-compile，仅编译未运行）

测试 NOT_RUN（R4 禁令延续）；未 Commit/Push 业务仓；P0 保持 HOLD。
