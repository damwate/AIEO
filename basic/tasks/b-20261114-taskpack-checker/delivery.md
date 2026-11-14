# 完工总结：b-20261114-taskpack-checker（任务包完整性检查工具）

## 原始需求：开发一个任务包完整性检查工具：用 Python 标准库实现，不引入第三方依赖。输入一个 Basic 任务目录，检查该任务包的任务记录是否完整——①基本信息是否齐全；②有无用户拍板的实施方案；③每个实施步骤有无独立验收记录；④REJECT 有无对应返工记录；⑤同一问题是否超过三轮；⑥整体测试与完工总结是否存在。输出整体结论 PASS 或 FAIL，FAIL 时逐项列出具体缺失项。本工具即首个真实闭环验证任务的交付物，开发过程必须完整走 Basic 四步流程（需求确认→方案拍板→逐步开发+独立验收→整体测试+交付）。——用户 2026-11-14 拍板确认（"确认，按此开工"），原文一字不改存档于 requirement.md。

## 最终实现内容：basic/tool/check_taskpack.py（789 行，仅 Python 标准库，无第三方依赖）。六项独立检查（单项 PASS/FAIL/N/A，整体 PASS/FAIL/IN_PROGRESS，FAIL 列具体缺失项）：①需求记录——requirement.md 非空非占位符+task-brief.md 9 必备字段齐全且不重复（重复字段 FAIL，计数覆盖表格行/行内键/标题三种书写形式，与提取函数口径一致）；阶段读取失败=FAIL 不猜阶段（冻结口径 1）。②步骤清单——`## S<编号> <名称>` 小节解析，步骤编号唯一（重复编号 FAIL，不静默接受）。③步骤验收记录——每步骤小节六要素齐全+「验收结论：PASS」+证据引用（dispatch 目录格式+reply SHA256 64 位 hex+包内证据路径），先判到期再评记录：PLANNING 全 N/A、IN_PROGRESS 编号<当前才到期、COMPLETED 全到期、当前步骤解析不出=FAIL 不猜。④REJECT 返工记录——编号级三方关联：REJECT 所在要素值∪⑥提取编号非空、每个编号有有效返工行（编号+40 位修复 SHA）、返工行被步骤小节引用。⑤返工次数——只计已关联有效行，同一问题第 3 次允许（冻结口径 3）、第 4 次及以后 FAIL。⑥交付记录——COMPLETED 时检查 delivery.md 七要素，未到期 N/A。证据路径三规则（仅任务目录内相对路径/拒绝绝对路径/拒绝 `..` 穿越，resolve+is_relative_to 防符号链接绕过）。`--json` 与文本共用同一结果对象（含目录不存在异常路径）。退出码 PASS=0、FAIL/IN_PROGRESS=1。异常输入一律 fail-safe 产生可识别结果（无未捕获异常）。使用说明落位 basic/tool/README.md。

## 修改文件：basic/tool/check_taskpack.py（新增）；basic/tool/test_check_taskpack.py（新增）；basic/tool/README.md（新增，本步 S4）；basic/tasks/b-20261114-taskpack-checker/：requirement.md、task-brief.md、steps.md（四步六要素+返工记录问题 1-10）、delivery.md（本步 S4）、acceptance/（四份验收请求+七场景 fixtures s2-fixtures/+运行证据 s1-runtime-evidence、-v2、s2-runtime-evidence、-v2、-v3）。

## 测试结果：unittest 33 用例 OK（`python -I -m unittest discover -s basic/tool -p "test_check_taskpack.py"`；黑盒 subprocess 走 CLI 真实退出码+validate_pack_path 单元直调，临时目录动态构造任务包自包含）。skipped=1（test_unit_symlink_escape_rejected：Windows 非开发者模式无符号链接创建权限，skipTest 如实跳过）——复验R2 验收方 Linux 沙箱附件独立执行 33/33 全部实际执行通过（失败 0 跳过 0），符号链接行为正确性已获独立验证。四步独立验收全闭环：S1 骨架四轮（复验R4 PASS）、S2 六项规则五轮（复验R3c PASS，附件动态验收七组全符）、S3 测试六轮（复验R3 PASS，含验收方沙箱独立执行）；返工问题共 10 项全部闭环（详见 steps.md 返工记录）。S4 本步自测：README 所列命令实跑核对一致；delivery.md 七要素与本总结核对一致。

## Git commit：代码主链（全部已推 GitHub main）——S1：49c82b5 骨架→40c66d9/9ae394a 返工→553ed2d 返工问题4；S2：3add8da 六项规则→e664e76 首验整改→3a8975a 复验R2 整改；S3：4818399 测试套件→941ee88 首验整改→b1bd307 复验R1 整改；S4 文档交付与各步验收请求/回填随 docs commit 入库（3191a34、3e61af1、78c6cc8、75bd102 及本 commit）。验收基线口径：各步待验收 commit 自身 diff=parent→commit（steps.md 各步③登记完整 SHA）。

## 未解决问题：无阻塞项。备注一项（非缺陷）：test_unit_symlink_escape_rejected 在 Windows 无符号链接权限环境按设计 skipTest（环境限制如实标注，非代码缺陷）；其行为正确性已由复验R2 验收方 Linux 环境实际执行独立验证。

## 后续建议：①派单/申报前可将本工具用于自身任务包自检（`python -I basic/tool/check_taskpack.py basic/tasks/<任务ID>`），提前发现记录缺口；②中级版工作流若沿用同构任务包（六要素+返工表+delivery 七要素），可直接复用本工具与 s2-fixtures 七场景作回归基线；③basic/WORKFLOW.md 模块五"同一问题"计数如需工具化强校验，可在后续版本迭代（当前⑤已覆盖返工次数上限）。
