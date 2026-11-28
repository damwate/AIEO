# R6 修订说明：R5-1 时间边界修正（b-20261127-bms-production-triage/P1 任务1）

## R5 裁定回顾

R5 复核：两阶段终止策略、强制中断后不限时等待、中断处理、中断位恢复、零断言、
扫描登记先于 fail、R4-2 审计、编译日志——全部 PASS。唯一阻断为时间边界问题：
第一阶段固定调用 awaitTermination(1, SECONDS)，最后一轮等待可能跨越 90 秒 deadline
（剩余 200ms 时仍等满 1 秒，线程在 deadline 之后、等待结束之前终止仍返回 true），
违反"90 秒内自然终止才返回 true"的严格口径。

## R6 修正（按审查方建议的最小修改）

第一阶段每轮计算剩余时间并以 NANOSECONDS 等待，严格受 deadline 控制：

```java
executor.shutdown();
long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(WORKER_GRACE_SECONDS); // 90s
while (true) {
    long remaining = deadline - System.nanoTime();
    if (remaining <= 0) {
        break;                                    // 自然等待阶段结束，严格不跨线
    }
    try {
        if (executor.awaitTermination(remaining, TimeUnit.NANOSECONDS)) {
            return true;                          // 仅在deadline之前确认终止才返回true
        }
    } catch (InterruptedException ie) {
        interrupted = true;                       // 记录并继续等待
    }
}
executor.shutdownNow();                           // 仅中断请求，不代表终止
while (!executor.isTerminated()) {                // 第二阶段：不限时等待实际终止（不变）
    try {
        executor.awaitTermination(1, TimeUnit.SECONDS);
    } catch (InterruptedException ie) {
        interrupted = true;
    }
}
return false;                                     // 已终止但超出宽限期
```

## 逐路径保证（与 R5 相同，仅时间口径收紧）

| 路径 | 返回值 | 返回前提 | 清理安全性 |
|---|---|---|---|
| 宽限期内（严格 ≤90s）自然终止 | true | awaitTermination(remaining) 在 deadline 前确认终止 | 扫描时线程已死，无在途提交 |
| 宽限期满后强制中断终止 | false | shutdownNow 后等待 isTerminated()==true | 同上；false 仅表示超期 |
| 等待中被打断 | 不改变返回语义 | 仅记录继续等待，不以中断冒充终止 | 同上 |

- 第一阶段不存在跨越 deadline 的等待窗口：每轮等待时长=剩余时间，剩余≤0 立即进入第二阶段。
- 第二阶段与 R5 完全一致：不限时等待实际终止，任何返回路径下扫描登记均在全部线程终止之后。
- 中断处理、返回语义、调用方顺序（等待终止→登记非基线 token→才 fail）、助手零断言、
  中断位恢复——均与 R5 保持一致，未做其他改动。
- R4-2 保持原样；ACL 业务代码（5 文件 diff）与 R4/R5 完全一致，零新增修改。

## 交付物

1. acl-MultiDeviceLoginIntegrationTest.java = 修改后完整并发测试源码
2. task1-acl-uncommitted.diff = 对应 diff（6 文件：5 业务文件与 R4 一致 + 测试文件整文件新增）
3. 本文件 = 顺序保证说明
4. task1-r6-testcompile.log = test-compile BUILD SUCCESS（仅编译未运行）

测试 NOT_RUN；未 Commit/Push 业务仓；P0 保持 HOLD。申请 R6 复核。
