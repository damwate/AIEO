# S2-A3 审查材料：T-P1-017（bundle_gate --version）

- 审查 commit：6faa2f003824703f777ea0b3a7d28f720fc395f0（fixture 分支 feature/T-P1-908-fixture，单提交）
- 任务：bundle_gate --version 版本输出（F-001 调度器验证任务）
- 验收标准：
- node phase1/tools/bundle_gate.mjs --version 输出版本行且退出码 0
- 无参调用维持既有 exit 2 报错行为
- --help 行为不变
- 仅修改 phase1/tools/bundle_gate.mjs 单文件

## diff 全文（已核验 SHA256=d262403c6768f6cd9ebb031950a1fbc565c1b46691472d1f59e51c9ae0f608ea，与 M1 ART-DIFF-004 一致）

```diff
diff --git a/phase1/tools/bundle_gate.mjs b/phase1/tools/bundle_gate.mjs
index e9cde78..d2ca622 100644
--- a/phase1/tools/bundle_gate.mjs
+++ b/phase1/tools/bundle_gate.mjs
@@ -70,6 +70,13 @@ function runCmd(cmd, args) {
 }
 
 // ------------------------------------------------------------------ main
+if (argv.includes("--version")) {
+  // T-P1-010（F-001 调度器验证任务 run ORCH-908011）：--version 输出版本行
+  // （与输出记录内 bundle_gate_version 元数据 "1.0" 一致），退出码 0；
+  // 不执行任何核验流程；其余参数行为不受影响。
+  console.log("bundle_gate version 1.0");
+  exit(0);
+}
 if (argv.includes("--help")) {
   // T-P1-001：--help 用法输出（仅输出用法，不执行任何核验流程，退出码 0）。
   console.log(`bundle_gate — AIEO Phase 1 聚合包机器核验工具（BYTE_INTEGRITY_GATE，T-P1-903 r4 决议新增）。
```

## 审查要求

逐行审查上述 diff 是否满足验收标准；回复仅一个 ```json 围栏对象：
{"result":"PASS|REWORK","summary":"<一句话>","issues":["<具体问题>…"],"reviewed_commit":"6faa2f003824703f777ea0b3a7d28f720fc395f0"}
result 仅 PASS/REWORK。
