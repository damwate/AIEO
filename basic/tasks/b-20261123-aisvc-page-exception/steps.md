# 步骤清单（b-20261123-aisvc-page-exception）

**方案状态：** 用户指令即方案框架（本地盘点→ChatGPT 讨论→实施就绪方案，不改码），无需另立 steps 冻结轮；节点自主推进（L-020）。

## S1 开工登记

①本步骤目标：建任务包 + 环境清单 §4/§5 开工阅读 + GDC/AISVC 双基线登记。

②修改文件：basic/tasks/b-20261123-aisvc-page-exception/{requirement.md,task-brief.md,steps.md}。

③修改内容：登记用户原话片段与澄清（主对象=GDC）、前序 RCA 与第一次试运行闭环证据；Standard/S2 选型三要素；M2 并行登记。

④执行结果：GDC 基线实查 `dev` 分支 `5c9ba1558a58b29633ea731fcdb563361b4c343b`；AISVC 基线 `main` `0c53c963d93e33c15ebd4498742828fcf9ffc57d`；前序维持边界（不扩大并行/不宣告 M2 通过/不立项/不授权改码）承袭。

⑤测试结果：任务包检查随 S3 回填（check_taskpack.py）。

⑥验收证据引用：basic/tasks/b-20261122-standard-multitask-trial/delivery.md（v2 R1-R3 闭环）；rca-whiteboard.md；开工基线随 S3 派单复核，引用 dispatch-2026-11-23T06-32-05 与 reply SHA256=9ae55f661713c93c5e4114e7bc971a40d94c00030729f59afa8010ceb9563a34。**验收结论：PASS**

## S2 本地盘点（已完成）

①本步骤目标：GDC 截图门禁/纹理加载/缓存/上传链代码核对 + AISVC 下游异常链补充核对。

②修改文件：basic/tasks/b-20261123-aisvc-page-exception/{analysis-gdc.md,analysis-aisvc.md}（新增）。

③修改内容：门禁只认 pendingGlbs===0(:544) 纹理/billboard 明确排除(:400,:420-421)；KTX2 晚到只补帧；billboard 载前可见；render_assets 0 命中；新发现 5 缺口（photo 无门/无超时/缓存键缺 revision/camera_snapshot 客户端自造/AiGenerationJob 无 params_json）；AISVC 结构校验有、像素语义零、进程级异常已实现。

④执行结果：RCA 结构类声明全部 CONFIRMED；运行时因果（2m04s/80MB/白块位置）标需运行时证据；缺口映射三阶段。

⑤测试结果：静态分析，无代码变更，测试不适用（如实标注）。

⑥验收证据引用：analysis-gdc.md；analysis-aisvc.md；GDC/AISVC file:line 证据；盘点结论随 S3 派单核验，引用 dispatch-2026-11-23T06-32-05 与 reply SHA256=9ae55f661713c93c5e4114e7bc971a40d94c00030729f59afa8010ceb9563a34。**验收结论：PASS**

## S3 ChatGPT 讨论（已完成）

①本步骤目标：派单代码核对结论+三问至独立新会话，采集 reply，形成实施就绪方案。

②修改文件：phase0/logs/dispatch-2026-11-23T06-32-05/（派单现场）；proposal.md（新增）。

③修改内容：简报 brief_gdc_rca_impl_r1.txt（913B≤1200B）经 --new-session --no-update-pointer 派发；三问=五缺口归属/三阶段顺序/五场景验收；reply 全文归档。

④执行结果：审查方裁定=PASS_WITH_CONSTRAINTS（有条件方案收敛，非实施授权）；photo() 提升阶段一 P0；五缺口进台账但 params_json 不入本轮；新增五负例 A-E；实施前四项证据门；明确禁止把 pendingTextures 塞进 pendingGlbs。审查方自述 GitHub 读取未绑定完整 SHA，裁定为条件性架构裁定。

⑤测试结果：未测（只读方案任务，无被测代码变更）。

⑥验收证据引用：dispatch-2026-11-23T06-32-05（会话 6b03de1d-ee04-83ec-8bd6-0c01824b8b2f）；reply SHA256=9ae55f661713c93c5e4114e7bc971a40d94c00030729f59afa8010ceb9563a34；marker 回显=完整首行（与 T1 形成对照）。**验收结论：PASS**
