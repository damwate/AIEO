# T-P1-017 REWORK 复验材料（R2 轮，run 918014）

## 1. 整改语境（REWORK 复验）

- R1 审查轮（EXEC-009/rvl-918003，reviewed_commit=6faa2f003824703f777ea0b3a7d28f720fc395f0）结论 **REWORK**，唯一问题：
  - **P2**：`--version` 检查位于 `--help` 检查之前，导致同时传入 `--version --help` 时直接输出版本并退出 0，不再执行原有帮助输出。基线代码中 `--help` 优先于参数解析，新增逻辑改变了这一既有行为。建议将 `--version` 检查放在 `--help` 检查之后。
- 处置决定：整改（DEC-063，2026-11-16，用户授权"按 delivery「后续建议」处理四项待拍板事项"）。本 commit=整改提交（fixture 分支单提交，父=fda9183dafb77ca15578abb244b3b2d15999fafb）。
- 本轮范围限定：仅复验上述 P2 是否关闭（--help 优先级恢复且 --version 单独行为不变）；不扩大审查范围。

## 2. 验收标准（M1 tasks.acceptance_criteria 原文）

1. `node phase1/tools/bundle_gate.mjs --version` 输出版本行且退出码 0；
2. 无参调用维持既有 exit 2 报错行为；
3. `--help` 行为不变（含与 `--version` 组合传入时帮助优先——R1 P2 整改点）；
4. 仅修改 `phase1/tools/bundle_gate.mjs` 单文件。

## 3. 实测行为（整改后，2026-11-16）

| 调用 | 输出 | 退出码 |
|---|---|---|
| `--version` | `bundle_gate version 1.0` | 0 |
| `--help` | 帮助全文 | 0 |
| `--version --help` | 帮助全文（帮助优先，P2 关闭点） | 0 |
| `--help --version` | 帮助全文 | 0 |
| 无参 | `bundle_gate: 缺 --commit` | 2 |

## 4. diff 全文（已核验 SHA）

被测 commit=0807064e193ef566987d1cfe29fea11d919ed85c（feature/T-P1-908-fixture）；
diff sha256=b1df094067ae3367a022c51b254d985fc9da90fb7bf6749167207f3fbb281858。

```diff
diff --git a/phase1/tools/bundle_gate.mjs b/phase1/tools/bundle_gate.mjs
index d2ca622..b60be16 100644
--- a/phase1/tools/bundle_gate.mjs
+++ b/phase1/tools/bundle_gate.mjs
@@ -70,13 +70,6 @@ function runCmd(cmd, args) {
 }
 
 // ------------------------------------------------------------------ main
-if (argv.includes("--version")) {
-  // T-P1-010（F-001 调度器验证任务 run ORCH-908011）：--version 输出版本行
-  // （与输出记录内 bundle_gate_version 元数据 "1.0" 一致），退出码 0；
-  // 不执行任何核验流程；其余参数行为不受影响。
-  console.log("bundle_gate version 1.0");
-  exit(0);
-}
 if (argv.includes("--help")) {
   // T-P1-001：--help 用法输出（仅输出用法，不执行任何核验流程，退出码 0）。
   console.log(`bundle_gate — AIEO Phase 1 聚合包机器核验工具（BYTE_INTEGRITY_GATE，T-P1-903 r4 决议新增）。
@@ -99,6 +92,14 @@ TAR 总哈希 → 解包 → 逐文件 SHA-256/size 对照 manifest；输出机
 退出码：0=全部核验通过；1=任一核验项失败（结果 JSON 如实记录失败项）；2=参数错误（缺参/未知参数/格式非法）。`);
   exit(0);
 }
+// T-P1-017 REWORK 整改（DEC-063，审查轮 P2）：--version 检查移至 --help 之后——
+// 组合传入 --version --help 时帮助优先（基线行为不变）；--version 单独传入输出
+// 版本行（与输出记录内 bundle_gate_version 元数据 "1.0" 一致），退出码 0；
+// 不执行任何核验流程；其余参数行为不受影响。
+if (argv.includes("--version")) {
+  console.log("bundle_gate version 1.0");
+  exit(0);
+}
 const opts = parseOpts(["commit", "parts-index", "tar", "manifest", "output-dir"]);
 const commit = opts.commit;
 if (!RE_SHA40.test(commit)) die("--commit 必须为完整 40 位 SHA");
```

> 注：以上 diff 为 M1 DIFF artifact 绑定文件原文（sha256=b1df094067ae3367a022c51b254d985fc9da90fb7bf6749167207f3fbb281858），审查腿 R1 将做 numstat 交叉核验。
