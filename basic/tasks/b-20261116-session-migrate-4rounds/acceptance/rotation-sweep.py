# 一次性排查（S2 续）：其他文档中独立的迁移/轮换时机规定（消息数阈值类）
import os

ROOT = r"D:\AIEO"
TARGETS = []  # (relpath)
for base in ("docs", "basic", "AGENTS.md"):
    p = os.path.join(ROOT, base)
    if os.path.isfile(p):
        TARGETS.append(p)
    else:
        for dirpath, dirnames, filenames in os.walk(p):
            dirnames[:] = [d for d in dirnames if d not in {"node_modules", "__pycache__", "tasks", "立项"}]
            for fn in filenames:
                if os.path.splitext(fn)[1].lower() in {".md", ".txt", ".py", ".mjs"}:
                    TARGETS.append(os.path.join(dirpath, fn))

PATTERNS = ["消息数", "60 条", ">60", "条 user 消息", "轮换优先级", "迁移时机", "轮换时机"]
hits = []
for p in TARGETS:
    rel = os.path.relpath(p, ROOT)
    try:
        with open(p, "r", encoding="utf-8", errors="ignore") as f:
            for i, line in enumerate(f, 1):
                for pat in PATTERNS:
                    if pat in line:
                        hits.append((rel, i, pat, line.strip()[:150]))
                        break
    except OSError:
        pass
print(f"FILES={len(TARGETS)} TOTAL={len(hits)}")
for rel, i, pat, text in hits:
    print(f"{rel}:{i} pat={pat!r} :: {text}")
