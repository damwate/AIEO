"""Persistent single-channel ChatGPT queue for ZCode. Only the worker opens a browser."""
from __future__ import annotations

import argparse
from contextlib import contextmanager
from hashlib import sha256
import json
import os
from pathlib import Path
import re
import sqlite3
import subprocess
import sys
import time
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[2]
STATE_DIR = ROOT / "runtime" / "playwright-queue"
LOG_DIR = ROOT / "phase0" / "logs"
INSTANCE = "standard-queue"
KEY = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,99}")
SESSION = re.compile(r"[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}")
LANES = ("planning", "architecture", "code-review", "test-acceptance")

SCHEMA = """
CREATE TABLE IF NOT EXISTS jobs (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    task TEXT NOT NULL,
    lane TEXT NOT NULL,
    round TEXT NOT NULL,
    brief TEXT NOT NULL,
    new_session INTEGER NOT NULL DEFAULT 0,
    state TEXT NOT NULL DEFAULT 'QUEUED'
        CHECK (state IN ('QUEUED','RUNNING','BLOCKED','COMPLETED','NOT_SENT')),
    target_session TEXT,
    target_url TEXT,
    evidence TEXT,
    UNIQUE(task,lane,round)
);
CREATE TABLE IF NOT EXISTS paused_tasks (
    task TEXT PRIMARY KEY
);
CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT PRIMARY KEY,
    task TEXT NOT NULL,
    lane TEXT NOT NULL,
    url TEXT NOT NULL,
    opened_by_seq INTEGER NOT NULL REFERENCES jobs(seq)
);
CREATE INDEX IF NOT EXISTS sessions_owner ON sessions(task,lane,opened_by_seq DESC);
CREATE UNIQUE INDEX IF NOT EXISTS single_inflight ON jobs ((1)) WHERE state IN ('RUNNING','BLOCKED');
"""


JOB_STATUS = """
    SELECT jobs.*, EXISTS (
        SELECT 1 FROM paused_tasks WHERE paused_tasks.task=jobs.task
    ) AS paused
    FROM jobs
"""


class QueueError(ValueError):
    pass


class Queue:
    def __init__(self, directory: Path):
        self.directory = directory.resolve()
        self.directory.mkdir(parents=True, exist_ok=True)
        self.path = self.directory / "queue.sqlite3"
        with self.connect() as conn:
            conn.execute("PRAGMA journal_mode=WAL")
            conn.executescript(SCHEMA)

    @contextmanager
    def connect(self):
        conn = sqlite3.connect(self.path, isolation_level=None, timeout=5)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys=ON")
        conn.execute("PRAGMA synchronous=FULL")
        try:
            yield conn
        finally:
            conn.close()

    @contextmanager
    def transaction(self):
        with self.connect() as conn, conn:
            conn.execute("BEGIN IMMEDIATE")
            yield conn

    def submit(self, task, lane, round_id, brief, *, new_session=False):
        if not KEY.fullmatch(task) or not KEY.fullmatch(round_id) or lane not in LANES:
            raise QueueError("invalid task, lane or round")
        if not brief.strip() or "\x00" in brief:
            raise QueueError("brief must contain text")
        brief = f"{round_marker(task, lane, round_id)}\n{brief.strip()}"
        if len(brief.encode("utf-8")) > 1200:
            raise QueueError("brief plus automatic round marker exceeds 1200 UTF-8 bytes")
        values = (task, lane, round_id, brief, int(new_session))
        with self.transaction() as conn:
            current = conn.execute(JOB_STATUS + " WHERE task=? AND lane=? AND round=?", values[:3]).fetchone()
            if current:
                if (current["brief"], current["new_session"]) != values[3:]:
                    raise QueueError("round already belongs to a different brief or rotation decision")
                return visible(current)
            if conn.execute("SELECT 1 FROM paused_tasks WHERE task=?", (task,)).fetchone():
                raise QueueError(f"task is paused: {task}")
            seq = conn.execute(
                "INSERT INTO jobs(task,lane,round,brief,new_session) VALUES (?,?,?,?,?)", values
            ).lastrowid
            return {"seq": seq, "task": task, "lane": lane, "round": round_id, "state": "QUEUED"}

    def set_paused(self, tasks, *, paused):
        tasks = tuple(dict.fromkeys(tasks))
        if not tasks or any(not KEY.fullmatch(task) for task in tasks):
            raise QueueError("invalid task ID for pause or resume")
        with self.transaction() as conn:
            statement = ("INSERT OR IGNORE INTO paused_tasks(task) VALUES (?)" if paused
                         else "DELETE FROM paused_tasks WHERE task=?")
            conn.executemany(statement, ((task,) for task in tasks))
            parameters = ", ".join("?" for _ in tasks)
            pending = [visible(row) for row in conn.execute(JOB_STATUS + f"""
                WHERE task IN ({parameters}) AND state IN ('QUEUED','RUNNING','BLOCKED') ORDER BY seq
            """, tasks)]
            return {"tasks": list(tasks), "paused": paused, "pending": pending}

    def claim(self):
        with self.transaction() as conn:
            if conn.execute("SELECT 1 FROM jobs WHERE state IN ('RUNNING','BLOCKED')").fetchone():
                return None
            job = conn.execute("""
                SELECT * FROM jobs WHERE state='QUEUED' AND NOT EXISTS (
                    SELECT 1 FROM paused_tasks WHERE paused_tasks.task=jobs.task
                ) ORDER BY seq LIMIT 1
            """).fetchone()
            if job is None:
                return None
            binding = None
            if not job["new_session"]:
                binding = conn.execute("""
                    SELECT session_id,url FROM sessions WHERE task=? AND lane=?
                    ORDER BY opened_by_seq DESC LIMIT 1
                """, (job["task"], job["lane"])).fetchone()
            target = tuple(binding) if binding else (None, None)
            conn.execute("UPDATE jobs SET state='RUNNING',target_session=?,target_url=? WHERE seq=?",
                         (*target, job["seq"]))
            return {**dict(job), "state": "RUNNING", "target_session": target[0], "target_url": target[1]}

    def get(self, seq):
        with self.connect() as conn:
            row = conn.execute(JOB_STATUS + " WHERE seq=?", (seq,)).fetchone()
            if row is None:
                raise QueueError("unknown queue sequence")
            return dict(row)

    def pending(self):
        with self.connect() as conn:
            return [visible(row) for row in conn.execute(JOB_STATUS + """
                WHERE state IN ('QUEUED','RUNNING','BLOCKED') ORDER BY seq
            """)]

    def previous_reply_digest(self, session_id, seq):
        with self.connect() as conn:
            rows = conn.execute(
                "SELECT evidence FROM jobs WHERE state='COMPLETED' AND seq<? ORDER BY seq DESC", (seq,)
            )
            for row in rows:
                evidence = json.loads(row["evidence"])
                if evidence["session_id"] == session_id:
                    return evidence["reply_sha256"]
            return None

    def finish(self, seq, state, evidence):
        with self.transaction() as conn:
            job = conn.execute(JOB_STATUS + " WHERE seq=?", (seq,)).fetchone()
            if job["state"] not in ("RUNNING", "BLOCKED"):
                return visible(job)
            if state == "COMPLETED":
                session = evidence["session_id"]
                binding = conn.execute("SELECT * FROM sessions WHERE session_id=?", (session,)).fetchone()
                reused = job["target_session"] is not None
                if reused and (session != job["target_session"] or binding is None):
                    raise QueueError("collected session differs from the assigned target")
                if binding and (not reused or (binding["task"], binding["lane"]) != (job["task"], job["lane"])):
                    raise QueueError("ChatGPT session is already bound")
                if not binding:
                    conn.execute("INSERT INTO sessions VALUES (?,?,?,?,?)",
                                 (session, job["task"], job["lane"], evidence["conversation_url"], seq))
            conn.execute("UPDATE jobs SET state=?,evidence=? WHERE seq=?",
                         (state, json.dumps(evidence, ensure_ascii=False), seq))
            return visible(conn.execute(JOB_STATUS + " WHERE seq=?", (seq,)).fetchone())


def round_marker(task, lane, round_id):
    digest = sha256(json.dumps([task, lane, round_id]).encode("utf-8")).hexdigest()
    return f"[AIEO-ROUND:{digest[:24]}]"


def visible(row):
    result = {key: row[key] for key in ("seq", "task", "lane", "round", "state", "target_session")}
    result["evidence"] = json.loads(row["evidence"]) if row["evidence"] else None
    result["paused"] = bool(row["paused"])
    return result


def read_receipt(folder):
    receipt = json.loads((folder / "send-receipt.json").read_text(encoding="utf-8"))
    if not re.fullmatch(r"dispatch-[0-9a-zA-Z-]+", receipt["dispatch_dir"]):
        raise QueueError("invalid dispatch receipt")
    return receipt


def validate_session(session, conversation_url):
    url = urlsplit(conversation_url)
    segments = url.path.strip("/").split("/")
    chat_path = len(segments) == 2 and segments[0] == "c"
    gpt_path = len(segments) == 4 and segments[0] == "g" and segments[2] == "c"
    if not isinstance(session, str) or not SESSION.fullmatch(session) or (
        (url.scheme, url.netloc) != ("https", "chatgpt.com")
        or not (chat_path or gpt_path) or segments[-1] != session or url.query or url.fragment
    ):
        raise QueueError("invalid ChatGPT session URL")


def checked_result(folder, log_dir, job):
    receipt = read_receipt(folder)
    archive = log_dir / receipt["dispatch_dir"]
    result = json.loads((archive / "result.json").read_text(encoding="utf-8"))
    reply = archive / "reply.txt"
    data = reply.read_bytes()
    digest = sha256(data).hexdigest()
    if (archive / "request.txt").read_bytes() != job["brief"].encode("utf-8"):
        raise QueueError("brief does not match the dispatch")
    if result.get("instance_id") != INSTANCE:
        raise QueueError("dispatch result is from a different browser instance")
    if not data or result["artifact_sha256"] != digest or result["size_bytes"] != len(data) or (
        not result["completion_checks"] or not all(value is True for value in result["completion_checks"].values())
    ):
        raise QueueError("reply evidence incomplete or inconsistent")
    session = result["session_id"]
    validate_session(session, result["conversation_url"])
    if receipt["state"] != "SEND_CONFIRMED" or receipt.get("session_id") != session or (
        not result["user_unit_key"] or receipt.get("user_unit_key") != result["user_unit_key"]
    ):
        raise QueueError("confirmed send and collected round differ")
    return {
        "session_id": session, "conversation_url": result["conversation_url"],
        "user_unit_key": result["user_unit_key"], "reply_sha256": digest,
        "reply_path": str(reply), "dispatch_dir": receipt["dispatch_dir"],
    }


def checked_recollection(queue, folder, log_dir, job, recovered):
    receipt = read_receipt(folder)
    archive = log_dir / receipt["dispatch_dir"]
    report = json.loads((recovered / "recoll-result.json").read_text(encoding="utf-8"))
    units = json.loads((recovered / "units-diag.json").read_text(encoding="utf-8"))
    if receipt["state"] != "SEND_CONFIRMED" or not receipt.get("user_unit_key"):
        raise QueueError("recollection requires the original confirmed send receipt")
    if Path(report["reference_failed_dispatch_dir"]).resolve() != archive.resolve() or (
        report["sent_user_unit_key_reported"] != receipt["user_unit_key"]
        or (archive / "request.txt").read_bytes() != job["brief"].encode("utf-8")
    ):
        raise QueueError("recollection targets a different dispatch")
    session = receipt["session_id"]
    validate_session(session, report["conversation_url"])
    marker = round_marker(job["task"], job["lane"], job["round"])
    # 归属只看 user 单元：assistant 回复常原样引用简报标记（GPT 回显 round marker 属常态），
    # 跨角色计数会把真实归属误判为重复（2026-11-23 首跑实战缺陷）。
    matched = [unit for unit in units
               if unit.get("role") == "user" and marker in unit.get("text_head", "")]
    users = [unit for unit in units if unit["role"] == "user"]
    if len(matched) != 1 or not users or matched[0] != users[-1] or (
        matched[0]["key"] != report["located_user_unit_key"]
    ):
        raise QueueError("recollected user unit failed round attribution")
    mandatory = ("final_stop_button_not_visible", "tail_is_assistant", "dil_uuid_present",
                 "uuid_stable", "stable_unit_read", "target_range_materialized", "not_prev_reply_sha")
    if not report["recollection"] or not all(report["checks"].get(check) is True for check in mandatory):
        raise QueueError("recollection completion checks failed")
    reply = recovered / "reply.txt"
    data = reply.read_bytes()
    digest = sha256(data).hexdigest()
    if not data or digest != report["reply_sha256"] or len(data) != report["reply_bytes"] or (
        queue.previous_reply_digest(session, job["seq"]) == digest
    ):
        raise QueueError("recollected reply failed digest, size or previous reply checks")
    return {
        "session_id": session, "conversation_url": report["conversation_url"],
        "user_unit_key": matched[0]["key"], "reply_sha256": digest,
        "reply_path": str(reply), "dispatch_dir": receipt["dispatch_dir"], "recollection": str(recovered),
    }


def dispatch(job, folder):
    request = folder / "request.txt"
    request.write_bytes(job["brief"].encode("utf-8"))
    command = [
        "node", str(ROOT / "phase0/tools/gpt_dispatch.mjs"), "--instance", INSTANCE,
        "--no-update-pointer", "--message-file", str(request),
    ]
    if job["target_session"]:
        target = folder / "session.json"
        target.write_text(json.dumps({
            "session_id": job["target_session"], "conversation_url": job["target_url"],
        }), encoding="utf-8")
        command += ["--session-result", str(target)]
    else:
        command += ["--new-session"]
    env = {**os.environ, "AIEO_DISPATCH_SEND_RECEIPT": str(folder / "send-receipt.json")}
    with (folder / "worker.log").open("wb") as log:
        return subprocess.run(command, cwd=ROOT, env=env, stdout=log, stderr=subprocess.STDOUT).returncode


def run_once(queue, adapter=dispatch, log_dir=LOG_DIR):
    job = queue.claim()
    if job is None:
        return None
    seq = job["seq"]
    folder = queue.directory / "jobs" / str(seq)
    try:
        folder.mkdir(parents=True, exist_ok=False)
        exit_code = adapter(job, folder)
        if exit_code != 0:
            receipt = read_receipt(folder)
            if receipt["state"] == "NOT_SENT":
                return queue.finish(seq, "NOT_SENT", {"exit_code": exit_code, **receipt})
            raise QueueError(f"dispatch exit {exit_code}; send or collection outcome uncertain")
        return queue.finish(seq, "COMPLETED", checked_result(folder, log_dir, job))
    except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError) as error:
        return queue.finish(seq, "BLOCKED", {"reason": str(error), "worker_dir": str(folder)})


def check_registered_task_startup(task):
    if not re.fullmatch(r"b-\d{8}-[A-Za-z0-9_.-]+", task):
        return
    pack = ROOT / "basic" / "tasks" / task
    result = subprocess.run(
        [sys.executable, "-I", str(ROOT / "basic/tool/check_taskpack.py"), str(pack), "--startup"],
        cwd=ROOT, capture_output=True, encoding="utf-8", check=False,
    )
    if result.returncode != 0:
        raise QueueError(result.stdout.strip() or result.stderr.strip() or "任务包开工核对执行失败")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    submit = commands.add_parser("submit")
    submit.add_argument("--task", required=True)
    submit.add_argument("--lane", choices=LANES, required=True)
    submit.add_argument("--round", required=True)
    submit.add_argument("--brief", type=Path, required=True)
    submit.add_argument("--new-session", action="store_true", help="Rotate this task lane with explicit authorization")
    pause = commands.add_parser("pause", help="Hold queued rounds and reject new rounds without opening the browser")
    pause.add_argument("--task", action="append", required=True)
    resume = commands.add_parser("resume", help="Make the tasks eligible for FIFO dispatch again")
    resume.add_argument("--task", action="append", required=True)
    status = commands.add_parser("status")
    status.add_argument("seq", type=int, nargs="?")
    worker = commands.add_parser("worker")
    worker.add_argument("--once", action="store_true")
    reconcile = commands.add_parser("reconcile")
    reconcile.add_argument("seq", type=int)
    reconcile.add_argument("--recoll", type=Path, help="existing L-018 recollection evidence directory")
    args = parser.parse_args()
    try:
        queue = Queue(STATE_DIR)
        if args.command == "submit":
            check_registered_task_startup(args.task)
            result = queue.submit(args.task, args.lane, args.round, args.brief.read_bytes().decode("utf-8"),
                                  new_session=args.new_session)
        elif args.command in ("pause", "resume"):
            result = queue.set_paused(args.task, paused=args.command == "pause")
        elif args.command == "status":
            result = visible(queue.get(args.seq)) if args.seq is not None else queue.pending()
        elif args.command == "reconcile":
            job = queue.get(args.seq)
            if job["state"] not in ("RUNNING", "BLOCKED"):
                result = visible(job)
            else:
                folder = queue.directory / "jobs" / str(args.seq)
                evidence = (checked_recollection(queue, folder, LOG_DIR, job, args.recoll.resolve())
                            if args.recoll else checked_result(folder, LOG_DIR, job))
                result = queue.finish(args.seq, "COMPLETED", evidence)
        else:
            while True:
                result = run_once(queue)
                if result is not None:
                    print(json.dumps(result, ensure_ascii=False), flush=True)
                if args.once:
                    return 1 if result and result["state"] == "BLOCKED" else 0
                if result is None:
                    time.sleep(1)
            return 0
        print(json.dumps(result, ensure_ascii=False))
        return 0
    except (OSError, ValueError, KeyError, TypeError, sqlite3.Error) as error:
        print(str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
