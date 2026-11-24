# R5/R6 size-auto 裁定落实（reply SHA256=147044d8864903038a8b3f207e361c5b84c9d3ccfe285c55c9e1efb1e8b08ce6）

## 裁定
- 前端未显式选择尺寸/质量时，GDC 不硬编码 2048x2048，也不主动设置固定 quality。
- auto=模型自动选择尺寸；但“保证匹配设计参考图宽高比”官方未承诺，保持 UNKNOWN。
- 将来 2K 是产品层显式选项，不是全局固定正方形：按设计稿比例映射具体 WIDTHxHEIGHT，并冻结到 Job；不得静默退成 2048x2048。
- 旧任务与重试保持原参数语义；未来若增加显式选项，应区分 OMIT/EXPLICIT，避免把缺省与显式 auto 混淆。

## 本任务落实
- GDC `16555dea` 已撤销 `abf40b2b` 中的固定 `size=2048x2048`，params 恢复 `{'n':1}`；R1 产品约束双写保留。
- GDC 当前未注入 size/quality；AIS 既有 job_spec 在缺省时采用 auto，这是现有默认链，未在本任务扩大改写 adapter。
- ChatGPT 建议“端到端完全省略字段”作为更严格语义，本任务仅承诺取消固定尺寸；若后续开发前端尺寸选项，再统一评审 OMIT/EXPLICIT 与 AIS adapter 缺省行为，避免本任务扩大范围。
- 未做真实供应商调用，未宣称 auto 必定保持参考图画幅。
