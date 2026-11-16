# 一次性修正：把交付文档中残留的提交短 SHA 统一为完整 40 位（只替换独立出现者）
import re, hashlib, pathlib, sys

ROOT = pathlib.Path(r"d:/AIEO")
FILES = [
    ROOT / "basic/tasks/b-20261116-workspace-spec/delivery.md",
    ROOT / "basic/tasks/b-20261116-workspace-spec/steps.md",
    ROOT / "basic/tasks/b-20261116-workspace-spec/task-brief.md",
]

MAP = {
    "787c2b5": "787c2b58902c8de6769bac6820d0740f02504285",
    "58e7943": "58e7943d7f4a7f0dedd07e66c3389bbf6d6c94f7",
    "c8eb708": "c8eb7087d47bd06524161edbee911ed060c9c61f",
    "d190ed0e": "d190ed0e6b902c5fc4659297aed95bf94bc8139c",
    "72ee196c": "72ee196c1ede434b7ddfb72a2450834505e1d2c4",
    "d563a2a5": "d563a2a5fa2e518a6da7f041d36218b89a2ad12a",
    "9efb14bb": "9efb14bbcc74d397e15558dc720706fc054ac627",
    "e32bda9": "e32bda9145cc172b87151a44fb6ae5b30bd14da2",
    "06d72bb": "06d72bb83deea9ce3bccfa6bd71ec47ec670a364",
    "d15dd50": "d15dd50534441b4a84e0c7b1b9456b5466bdb676",
    "8c310fa": "8c310faf4aadeeaac2ccba7ed31b25de6e4260ee",
}

# R4/R5 回复文件的实际 SHA（原记录为截断值，按落盘文件重算后补齐）
for d, placeholder in [
    ("phase0/logs/dispatch-2026-11-16T08-48-34/reply.txt", "5f2da9d73f809d7b"),
    ("phase0/logs/dispatch-2026-11-16T08-56-47/reply.txt", "b8e092dfd0e3d468"),
]:
    p = ROOT / d
    if p.exists():
        MAP[placeholder] = hashlib.sha256(p.read_bytes()).hexdigest()

total = 0
for f in FILES:
    text = f.read_text(encoding="utf-8")
    orig = text
    for short, full in MAP.items():
        # 仅替换独立出现（前后非十六进制字符），避免破坏已完整的 40 位值
        pattern = re.compile(r"(?<![0-9a-f])" + short + r"(?![0-9a-f])")
        text, n = pattern.subn(full, text)
        total += n
    if text != orig:
        f.write_text(text, encoding="utf-8", newline="\n")
    print(f.name, "changed" if text != orig else "unchanged")
print("replacements:", total)
