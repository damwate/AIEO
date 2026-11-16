# 同步 delivery 的轮次索引至 R18，并追加 R17/R18 两行验收记录
import pathlib

p = pathlib.Path(r"d:/AIEO/basic/tasks/b-20261116-workspace-spec/delivery.md")
t = p.read_text(encoding="utf-8")

t = t.replace("R1～R16 回复", "R1～R18 回复")
t = t.replace("### 独立验收链（S3 阶段：交付记录，R7～R16）",
              "### 独立验收链（S3 阶段：交付记录，R7～R18）")
t = t.replace(
    "验收轮次=R7～R16（R13=PASS 为 S3 交付复核通过；R14=最终记录一致性复核，仅 P1-1；R15=按整改 commit 核验，仅问题12 行占位；R16=按修正后 HEAD 核验，问题12 通过，余 R15 记录缩写与 task-brief 轮次滞后）。",
    "验收轮次=R7～R18（R13=PASS 为 S3 交付复核通过；R14=最终记录一致性复核，仅 P1-1；R15=按整改 commit 核验，仅问题12 行占位；R16=按修正后 HEAD 核验，问题12 通过，余 R15 记录缩写与 task-brief 轮次滞后；R17=推送失败致核验对象不可见，审查方拒绝替代对象；R18=推送恢复后复核，仍指认历史 SHA 缩写残留，要求全量核对）。"
)

anchor = "| R16 | `dispatch-2026-11-16T10-14-42/recoll` |"
idx = t.find(anchor)
if idx == -1:
    raise SystemExit("anchor not found")

end = t.find("\n", idx)
rows = (
    "\n| R17 | `dispatch-2026-11-16T10-11-36` | **当轮 result.json 的 reply_sha256 缺失（如实登记）**，回复全文见该目录 `reply.txt`（1694B） | 推送失败（Connection reset）致核验对象不可见，审查方明确不以分支最新提交替代指定对象 |"
    "\n| R18（补正说明） | `dispatch-2026-11-16T10-27-33/recoll` | `8ddf1f0e8f94fe3fd40a28d5f33e5e3570fe25eca422cd660f75315a49e1153f` | R17 提交范围符合说明；仍 REJECT——指认历史 SHA 缩写残留，要求一次性全量核对并登记整改待复核态（本轮以脚本全量核对：替换数 0，另清两处 SHA 后残留省略号，见 `acceptance/sha-audit.txt`） |"
)
t = t[:end] + rows + t[end:]
p.write_text(t, encoding="utf-8", newline="\n")
print("delivery updated")
