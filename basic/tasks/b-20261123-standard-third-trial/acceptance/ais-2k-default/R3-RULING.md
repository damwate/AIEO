# 2K 档位裁定（planning R3，reply SHA256=4bb41bc0596afa30399f99cd8ad48c77d90b40813b81e0b49ce4a6f4e48feaf3）

- 派单 seq3（2026-11-23T13:58 发送，采集 fail-closed→L-018 只读补采→七查全过→reconcile COMPLETED）。
- 背景：用户批评 1K→2K 首次直改未与 GPT 讨论；补走裁定。

## 裁定结论：不批准统一切换 size="2K"

核心区分：档位参数（供应商定义 1K/2K/4K）≠ 请求参数（实际发送的 size 串）≠ 输出像素。
现有实测（1024x1024→1254×1254；2048x2048→2048×2048；auto→内容自适应）**不能反推**档位映射表。
远桥云公开文档明确 size 用「宽x高」像素串、不支持的尺寸返回 400——"2K" 档位串是否被 wukong/yuanqiao/d5b728b6 识别**未证实**，不得按 openai_compat 类型批量修改。

## MUST-FIX（执行 apply-2k.sh 前必须完成）

- MF-01 分供应商档位证据矩阵：每家（wukong/yuanqiao/vendor-d5b728b6）分别实测 size ∈ {1024x1024 基线, 2048x2048, 2K 档位串, 不传, auto}，edits 与 generations 通道分开（不得拿 generations 成功证明 edits 行为）。
- MF-02 请求/响应成对留证：供应商/模型/端点/原始 size/HTTP 码/原始错误体/回图真实宽高/文件 SHA256/耗时/计费档位（可得时）。不得凭 HTTP 200 判成功。
- MF-03 费用与实际档位确认：防止"参数被忽略回退 1K 但按 2K 计费"或反之。
- MF-04 脚本安全门：apply-2k.sh 需 diff 展示、只动列名供应商、不碰 intelalloc/密钥、烟测失败即停、一键回滚、烟测结果绑定 commit+配置 SHA256。

## IntelAlloc（vendor-38a26ea7）

- 不建议继续无条件 auto，但**本次不纳入 2K 切换**；其常 400 需独立诊断（保留 400 原始响应体；查 image[] 传递、multipart boundary、模型是否在 /models 目录、参数兼容性）。只有"省略 size 成功 + auto 失败"才有理由移除 auto。

## 后续动作

1. 220 可达后先跑增强版 verify（按 MF-01/02 矩阵出证据 + 计费档位留证），生成供应商能力矩阵；
2. 矩阵支持哪家用哪家的 mode（pixel_size / size_tier / auto / omit 分供应商配置，不追求统一格式）；
3. 证据齐后修订 apply-2k.sh（加分供应商 mode 与 MF-04 安全门）再执行；
4. IntelAlloc 400 诊断单独立项。
