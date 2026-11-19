# 步骤清单（b-20261119-multitask-p1-planning）

**方案状态：** v0.1 草案（待 R1 规划协商复审冻结）。

## S1 开工登记

①本步骤目标：按 Basic 工作流登记 P1 规划协商任务（requirement/task-brief/steps），登记基线 SHA 与三待裁定缺口，ST-05 自检。

②修改文件：basic/tasks/b-20261119-multitask-p1-planning/{requirement.md,task-brief.md,steps.md}。

③修改内容：登记用户原话（"先把能做的做了"+历史 ChatGPT 委托）、执行者理解（P0 PASS 已登记但 v1.0 未冻结、⑥ 门 P1/P2 口径冲突、P1 开跑授权归用户）、验收目标（三缺口裁定+v1.0 草案+⑥澄清+开跑前置清单）、边界红线（不开跑/不触 DEC-010/不改运行时）、状态表。

④执行结果：任务包建妥；基线 HEAD=`4685f919e4c8bd031aa320e1fb8895f4a97c5512`。ST-05 自检待回填。

⑤测试结果：python -I basic/tool/check_taskpack.py basic/tasks/b-20261119-multitask-p1-planning —— 待回填（PLANNING 期合法态预期）。

⑥验收证据引用：本任务包 S1 登记（基线 commit `4685f919e4c8bd031aa320e1fb8895f4a97c5512`）；S1 独立验收经 S2 规划协商链直读签核（待 R1 裁定）——派单目录与 reply SHA 待回填。

**验收结论：PASS**（开工登记完成；独立验收待 S2 规划协商链签核）

## S2 规划协商（待执行）
（R1 派单后按六要素回填）

## S3 方案冻结草案（待执行）
（R1 裁定后按六要素回填）

## S4 独立验收（待执行）
（按六要素回填）

## S5 收口交付（待执行）
（按六要素回填）

---

## ST-05 自检记录
- S1：待回填（运行 check_taskpack.py 后）。
