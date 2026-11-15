# -*- coding: utf-8 -*-
"""S2-R1 P1-03 整改：原始现场证据链归档入 Git（acceptance/evidence-s2/）。
只读汇集：审查轮账本/dispatch 现场结果与回复/recoll 补采结果/M1 只读导出。
凭据与敏感信息不入档（C6）：service-tokens/env 不在汇集范围。"""
import hashlib
import json
import os
import shutil
import sqlite3
from pathlib import Path

REPO = Path("D:/AIEO")
OUT = REPO / "basic/tasks/b-20261115-gpt03-review-leg/acceptance/evidence-s2"
OUT.mkdir(parents=True, exist_ok=True)
LOGS = REPO / "phase0" / "logs"
RT = REPO / "runtime" / "review-leg"

MANIFEST = []


def put(src: Path, arc: str, note: str = ""):
    if not src.is_file():
        print("MISS:", src)
        return
    dst = OUT / arc
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(src, dst)
    sha = hashlib.sha256(dst.read_bytes()).hexdigest()
    MANIFEST.append({"archive": arc, "source": str(src.relative_to(REPO)),
                     "bytes": dst.stat().st_size, "sha256": sha, "note": note})


# ---- 审查轮账本（六轮）----
for rk in ("918003", "918005", "918007", "918010", "918011", "918012"):
    led = RT / f"rvl-{rk}" / "ledger.jsonl"
    put(led, f"ledger/rvl-{rk}-ledger.jsonl", f"review round {rk} ledger (append-only)")
    rep = RT / f"rvl-{rk}" / "review-leg-report.json"
    put(rep, f"ledger/rvl-{rk}-report.json", "final leg report")
    for extra in ("brief.txt", "reply.txt", "ajv-input-envelope.json", "a5-breakpoint-snapshot.json",
                  "ledger.jsonl.bak-a5-repair", "ledger.jsonl.bak-a8-repair", "recoll_driver.mjs"):
        p = RT / f"rvl-{rk}" / extra
        if p.is_file():
            put(p, f"ledger/rvl-{rk}-{extra}", "run dir evidence")

# ---- dispatch 现场（验收轮+审查轮）----
for d in sorted(LOGS.glob("dispatch-2026-11-15T1[4-7]*")):
    name = d.name
    for f in ("result.json", "reply.txt", "request.txt", "run.log"):
        p = d / f
        if p.is_file():
            put(p, f"dispatch/{name}/{f}", "dispatch evidence")

# ---- recoll 补采现场 ----
for d in sorted(LOGS.glob("recoll-2026-11-15T1[3-6]*")):
    name = d.name
    for f in ("result.json", "reply.txt"):
        p = d / f
        if p.is_file():
            put(p, f"recoll/{name}/{f}", "recollection evidence")

# ---- A3 注入构造 probe 现场 ----
for d in sorted(LOGS.glob("recoll-2026-11-15T16-0[6-8]*")):
    for f in ("result.json", "units-diag.json", "run.log"):
        p = d / f
        if p.is_file():
            put(p, f"a3-probe/{d.name}/{f}", "A3 injection probe evidence")

# ---- runner 重启测试现场（tmp 内 dispatch-runner-*）----
import glob
import tempfile
for d in sorted(glob.glob(tempfile.gettempdir() + "/rvl-test-*/dispatch-logs/dispatch-runner-*")):
    name = Path(d).name
    for f in ("result.json", "reply.txt", "request.txt"):
        p = Path(d) / f
        if p.is_file():
            put(p, f"runner-tests/{name}/{f}", "real-process-restart test evidence")

# ---- M1 只读导出（908 DB）----
conn = sqlite3.connect(f"file:{REPO}/runtime/t-p1-908/aieo.db?mode=ro", uri=True)
conn.row_factory = sqlite3.Row
export = {}
for t, q in (
    ("tasks", "SELECT task_id,status,task_package_hash,engineering_standard_version,knowledge_base_commit,updated_at FROM tasks WHERE task_id IN ('T-P1-017','T-P1-018','T-P1-022','T-P1-023','T-P1-024','T-P1-026')"),
    ("task_events", "SELECT event_id,task_id,event,from_status,to_status,actor_id,correlation_id,created_at FROM task_events WHERE task_id IN ('T-P1-017','T-P1-018','T-P1-022','T-P1-023','T-P1-024','T-P1-026') ORDER BY task_id,created_at"),
    ("review_reports", "SELECT task_id,execution_id,reviewed_commit,reviewer_agent_id,result,created_at FROM review_reports WHERE task_id IN ('T-P1-017','T-P1-018','T-P1-022','T-P1-023','T-P1-024','T-P1-026')"),
    ("artifacts_review", "SELECT artifact_id,task_id,type,path,sha256,created_at FROM artifacts WHERE task_id IN ('T-P1-017','T-P1-018','T-P1-022','T-P1-023','T-P1-024','T-P1-026') AND type IN ('REVIEW_EVIDENCE','DIFF')"),
    ("messages_review", "SELECT message_id,task_id,message_type,direction,source_agent_id,target_agent_id,correlation_id,created_at FROM messages WHERE task_id IN ('T-P1-017','T-P1-018','T-P1-022','T-P1-023','T-P1-024','T-P1-026') AND message_type='CODE_REVIEW_SUBMITTED'"),
):
    rows = [dict(r) for r in conn.execute(q).fetchall()]
    export[t] = rows
m1_path = OUT / "m1-export.json"
m1_path.write_text(json.dumps(export, ensure_ascii=False, indent=2), encoding="utf-8")
MANIFEST.append({"archive": "m1-export.json", "source": "runtime/t-p1-908/aieo.db (read-only)",
                 "bytes": m1_path.stat().st_size,
                 "sha256": hashlib.sha256(m1_path.read_bytes()).hexdigest(),
                 "note": "M1 read-only export: tasks/events/reports/artifacts/messages for the six tasks"})

(OUT / "MANIFEST.json").write_text(json.dumps(MANIFEST, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"archived {len(MANIFEST)} files to {OUT.relative_to(REPO)}")
