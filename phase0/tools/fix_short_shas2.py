# 第二次修正：补全 R4/R5/R14 回复 SHA 与遗留短 SHA（幂等）
import pathlib

ROOT = pathlib.Path(r"d:/AIEO")
STEPS = ROOT / "basic/tasks/b-20261116-workspace-spec/steps.md"
DELIVERY = ROOT / "basic/tasks/b-20261116-workspace-spec/delivery.md"

R4 = "5f2da9d73f809d7b6fdbe827b5efb73d9d019061a0c3c29bbe83d4fa0f1e0a15"
R5 = "b8e092dfd0e3d4681f673183ff42aafea1eac47fa0a9676cc15e10766cbce764"

pairs_steps = [
    ("sha256=5f2da9d73f809d7b…全文见 recoll/reply.txt", "sha256=" + R4 + "（recoll/reply.txt）"),
    ("sha256=b8e092dfd0e3d468…", "sha256=" + R5),
    ("`cc29fc51…`", "`cc29fc51b23426b8f581416a82eed521117f74fd`"),
]

pairs_delivery = [
    ("`b8e092dfd0e3d468…`（当轮落盘；完整值见该目录 result.json）", "`" + R5 + "`（recoll/reply.txt）"),
    ("`5f2da9d73f809d7b…`", "`" + R4 + "`"),
]

for path, pairs in ((STEPS, pairs_steps), (DELIVERY, pairs_delivery)):
    text = path.read_text(encoding="utf-8")
    for old, new in pairs:
        text = text.replace(old, new)
    path.write_text(text, encoding="utf-8", newline="\n")
    print(path.name, "done")
