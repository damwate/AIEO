"""Run the Standard FIFO through the existing Playwright CLI (isolated test mode)."""
from __future__ import annotations

import argparse
from hashlib import sha256
import json
import os
from pathlib import Path
import re
import subprocess
import time

from .config import REPO_ROOT, Settings
from .database import Database, json_text
from .standard_work import record


def take_review(db):
    with db.transaction() as conn:
        if conn.execute("""
            SELECT 1 FROM standard_reviews WHERE state IN ('DISPATCHING','UNCERTAIN')
        """).fetchone():
            return None
        row = conn.execute("SELECT * FROM standard_reviews WHERE state='QUEUED' ORDER BY seq LIMIT 1").fetchone()
        if row is None:
            return None
        conn.execute("UPDATE standard_reviews SET state='DISPATCHING' WHERE seq=?", (row["seq"],))
        record(conn, "REVIEW_DISPATCHING", str(row["seq"]), {"round_id": row["round_id"]})
        return dict(row)


def settle_review(db, seq, evidence=None):
    state = "DONE" if evidence is not None else "UNCERTAIN"
    with db.transaction() as conn:
        changed = conn.execute("""
            UPDATE standard_reviews SET state=?, evidence=?
            WHERE seq=? AND state IN ('DISPATCHING','UNCERTAIN')
        """, (state, json_text(evidence) if evidence is not None else None, seq))
        if changed.rowcount:
            record(conn, f"REVIEW_{state}", str(seq), evidence or {})


def load_result(job_dir, log_root):
    receipt = json.loads((job_dir / "send-receipt.json").read_text(encoding="utf-8"))
    dispatch_dir = receipt["dispatch_dir"]
    if not re.fullmatch(r"dispatch-[0-9a-zA-Z-]+", dispatch_dir):
        raise ValueError("invalid dispatch receipt directory")
    folder = log_root / dispatch_dir
    result = json.loads((folder / "result.json").read_text(encoding="utf-8"))
    reply = (folder / "reply.txt").read_bytes()
    digest = sha256(reply).hexdigest()
    if result["artifact_sha256"] != digest or not result["completion_checks"] or not all(
        value is True for value in result["completion_checks"].values()
    ):
        raise ValueError("dispatch evidence incomplete or inconsistent")
    if receipt["state"] != "SEND_CONFIRMED" or receipt.get("session_id") != result["session_id"] or (
        receipt.get("user_unit_key") != result["user_unit_key"]
    ):
        raise ValueError("send receipt and collected round differ")
    if (job_dir / "request.txt").read_bytes() != (folder / "request.txt").read_bytes():
        raise ValueError("dispatch request does not match the FIFO job")
    if not result["session_id"] or not result["user_unit_key"]:
        raise ValueError("result is missing round attribution")
    return {"dispatch_dir": dispatch_dir, "reply_sha256": digest,
            "session_id": result["session_id"], "user_unit_key": result["user_unit_key"]}


def dispatch(job, job_dir):
    job_dir.mkdir(parents=True, exist_ok=False)
    message_file = job_dir / "request.txt"
    message_file.write_bytes(job["message"].encode("utf-8"))
    env = {**os.environ, "AIEO_DISPATCH_SEND_RECEIPT": str(job_dir / "send-receipt.json")}
    with (job_dir / "process.log").open("wb") as output:
        subprocess.run(
            ["node", str(REPO_ROOT / "phase0/tools/gpt_dispatch.mjs"), "--new-session",
             "--no-update-pointer", "--message-file", str(message_file)],
            cwd=REPO_ROOT, env=env, stdout=output, stderr=subprocess.STDOUT, check=True, timeout=900,
        )
    return load_result(job_dir, REPO_ROOT / "phase0/logs")


def run_one(db, root, adapter=dispatch):
    job = take_review(db)
    if job is None:
        return False
    try:
        evidence = adapter(job, root / str(job["seq"]))
    except (OSError, ValueError, KeyError, subprocess.SubprocessError):
        settle_review(db, job["seq"])
        return False
    settle_review(db, job["seq"], evidence)
    return True


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--once", action="store_true")
    parser.add_argument("--reconcile", type=int, metavar="QUEUE_SEQ",
                        help="Read completed evidence for the original dispatch, without opening the browser")
    args = parser.parse_args()
    settings = Settings.from_environ()
    if settings.env != "test":
        parser.error("standard browser worker requires an isolated test instance")
    db = Database(settings.db_path)
    root = (settings.log_dir / "standard-reviews").resolve()
    if args.reconcile is not None:
        evidence = load_result(root / str(args.reconcile), REPO_ROOT / "phase0/logs")
        settle_review(db, args.reconcile, evidence)
        return
    while True:
        if not run_one(db, root):
            if args.once:
                return
            time.sleep(1)
        elif args.once:
            return


if __name__ == "__main__":
    main()
