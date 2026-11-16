# 一次性残留排查脚本（b-20261116-session-migrate-4rounds S2）：全仓搜索旧阈值同义表达
import os, sys

ROOT = r"D:\AIEO"
SKIP_DIRS = {".git", "node_modules", ".zcode", ".codebuddy", "__pycache__"}
SKIP_PREFIXES = (
    os.path.join(ROOT, "phase0", "logs") + os.sep,      # 派单/补采历史现场，如实归档不改写
    os.path.join(ROOT, "phase1", "manifests") + os.sep,  # 历史证据包(b64)
    os.path.join(ROOT, "phase1", "logs") + os.sep,       # 历史执行日志
    os.path.join(ROOT, "basic", "tasks") + os.sep,       # 历史任务包记录（原记录保留不改写，逐项人工核对）
    os.path.join(ROOT, "phase0", "reports") + os.sep,    # 历史报告
    os.path.join(ROOT, "handoff") + os.sep,              # 历史交接包
    os.path.join(ROOT, "phase0", "e2e-poc") + os.sep,    # 历史POC现场
)
PATTERNS = ["10+ 轮", "10+轮", "约 10 轮", "约10轮", "10 轮以上", "10轮以上", "10 多轮", "十余轮"]
EXTS = {".md", ".txt", ".py", ".mjs", ".js", ".ts", ".json"}

hits = []
for dirpath, dirnames, filenames in os.walk(ROOT):
    dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
    for fn in filenames:
        ext = os.path.splitext(fn)[1].lower()
        if ext not in EXTS:
            continue
        p = os.path.join(dirpath, fn)
        rel = os.path.relpath(p, ROOT)
        skipped = p.startswith(SKIP_PREFIXES)
        try:
            with open(p, "r", encoding="utf-8", errors="ignore") as f:
                for i, line in enumerate(f, 1):
                    for pat in PATTERNS:
                        if pat in line:
                            hits.append((rel, i, pat, "SKIP(历史区)" if skipped else "LIVE", line.strip()[:160]))
                            break
        except OSError:
            pass

print(f"PATTERNS={PATTERNS}")
print(f"TOTAL_HITS={len(hits)}  LIVE={sum(1 for h in hits if h[3]=='LIVE')}  SKIP={sum(1 for h in hits if h[3]!='LIVE')}")
for rel, i, pat, zone, text in hits:
    print(f"[{zone}] {rel}:{i} pat={pat!r} :: {text}")
