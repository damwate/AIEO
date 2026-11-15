#!/usr/bin/env python3
"""review_leg.py 正反例测试矩阵（L-017 第 3 条：审查腿自身的验收；b-20261115-gpt03-review-leg S1）。

覆盖面（charter 定稿 v1.0 可注入部分；真实派单类 A1/A3/A5①/A6 留 S2/S3 实测）：
- 附录 B 白名单客户端：越界端点/越界事件值 fail-closed 拒发（不发网络请求即拦截）
- 幂等标识确定性：message_id/event_id/idempotency_key 重启不漂移（A4 前提）
- 真实 M1 REST 全流程：本地测试服务实例（独立临时 DB，不触碰 908 DB）；
  契约校验=真实冻结 schema 文件（contracts/v1.0，Ajv 2020，零 mock 契约面）
- ChatGPT 边界唯一测试替身：仅 gpt_dispatch 调用替换（落盘真实形状的派单目录），
  其余（Git 校验/账本/REST/登记/状态机推进）全部真实路径
- A2/A10 逻辑路径：REWORK 结论登记后停等，无自动重开
- A4 幂等重放：同请求原文重放 → 409 幂等命中，无重复登记
- A7 事件幂等：R1 重复执行 → 同 event_id 单条，无第二事件副作用
- A8 账本断裂：send intent 无 confirm → resume fail-closed 拒绝（禁以缺失为由重发）
- A9 部分登记：artifact 成功后中断 → 续跑补登记，artifact ID 不变不覆盖
- 账本原子性/腿级 BLOCKED 语义/简报 1200B 硬限/diff SHA 交叉核验

运行：python phase1/tools/test_review_leg.py （自带临时 M1 实例与 git 夹具，自建自清）
"""

import contextlib
import importlib.util
import json
import os
import socket
import sqlite3
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "phase1" / "tools"))

import review_leg as rl  # noqa: E402  (module import safe: __main__ guarded)
from scheduler import M1Client, OrchestrationError  # noqa: E402


REAL_SUBPROCESS_RUN = subprocess.run  # 派单替身透传用（共享 subprocess 模块，勿直接递归调用）


def free_port() -> int:
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


class FakeProc:
    def __init__(self, returncode=0, stdout=b"", stderr=b""):
        self.returncode = returncode
        self.stdout = stdout
        self.stderr = stderr


class M1TestServer:
    """独立 M1 测试实例（临时 DB/目录/端口；908 DB 零接触）。"""

    def __init__(self, root: Path):
        self.root = root
        self.port = free_port()
        self.base = f"http://127.0.0.1:{self.port}"
        self.db_path = root / "aieo.db"
        self.env = {
            **os.environ,
            "AIEO_ENV": "development",
            "AIEO_SESSION_SECRET": "rvl-test-" + "0" * 32,
            "AIEO_PLATFORM_ADMIN_USERNAME": "OWNER",
            "AIEO_PLATFORM_ADMIN_PASSWORD": "rvl-test-admin-pw-2026-1115x",
            "AIEO_SERVER_BIND": f"127.0.0.1:{self.port}",
            "AIEO_DB_PATH": str(self.db_path),
            "AIEO_LOG_DIR": str(root / "logs"),
            "AIEO_ARTIFACT_DIR": str(root / "artifacts"),
        }
        self.proc = None

    def start(self):
        self.proc = subprocess.Popen(
            [sys.executable, "-m", "app.platform.main"], cwd=str(REPO_ROOT),
            env=self.env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        deadline = time.time() + 40
        while time.time() < deadline:
            try:
                with urllib.request.urlopen(f"{self.base}/api/v1/health", timeout=2) as r:
                    if r.getcode() == 200:
                        return
            except OSError:
                pass
            time.sleep(0.5)
        raise RuntimeError("test M1 failed to start within 40s")

    def stop(self):
        if self.proc:
            self.proc.terminate()
            try:
                self.proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                self.proc.kill()

    def query(self, sql: str, params=()):
        conn = sqlite3.connect(f"file:{self.db_path}?mode=ro", uri=True)
        conn.row_factory = sqlite3.Row
        try:
            return [dict(r) for r in conn.execute(sql, params).fetchall()]
        finally:
            conn.close()


def make_dispatch_double(review_reply: str, dispatch_root: Path, fail_first: bool = False):
    """ChatGPT 边界唯一测试替身：拦截 gpt_dispatch 调用，落盘真实形状派单目录。
    其余 subprocess（git/ajv）原样透传真实执行。fail_first=首次调用返回非零（发送失败注入）。"""
    calls = {"n": 0}

    def wrapper(cmd, **kw):
        joined = " ".join(map(str, cmd))
        if "gpt_dispatch.mjs" not in joined:
            return REAL_SUBPROCESS_RUN(cmd, **kw)
        calls["n"] += 1
        if fail_first and calls["n"] == 1:
            return FakeProc(3, b"", b"injected send failure (test double)")
        # 解析 --message-file 参数（request.txt 证据复制）
        msg_file = None
        for i, a in enumerate(map(str, cmd)):
            if a == "--message-file" and i + 1 < len(cmd):
                msg_file = Path(str(cmd[i + 1]))
        ddir = dispatch_root / f"dispatch-double-{time.strftime('%H%M%S')}-{calls['n']}"
        ddir.mkdir(parents=True, exist_ok=True)
        if msg_file and msg_file.is_file():
            (ddir / "request.txt").write_bytes(msg_file.read_bytes())
        (ddir / "reply.txt").write_text(review_reply, encoding="utf-8")
        (ddir / "result.json").write_text(json.dumps({
            "user_unit_key": "fallback-turn-1:0:user",
            "unit_count": 1,
            "conversation_url": "https://chatgpt.com/c/11111111-2222-4333-8444-555555555555",
            "completion_checks": {"send_double_verify": True},
        }, ensure_ascii=False), encoding="utf-8")
        return FakeProc(0)

    return wrapper, calls


class ReviewLegTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = Path(tempfile.mkdtemp(prefix="rvl-test-"))
        cls.server = M1TestServer(cls.tmp / "m1")
        cls.server.start()
        cls.owner = M1Client(cls.server.base)
        cls.owner.login(os.environ.get("RVL_TEST_ADMIN_USER", "OWNER"),
                        os.environ.get("RVL_TEST_ADMIN_PW", "rvl-test-admin-pw-2026-1115x"))
        # 建制：agents（GPT-03 reviewer / ENGINE-01 服务身份 / 开发执行者）
        cls.tokens = {}
        for aid, atype, role, issue in (
            ("GPT-03", "reviewer", "code-review-session", False),
            ("ENGINE-01", "system", "review-leg-engine", True),
            ("DEV-EXEC-01", "developer", "dev-executor", False),
        ):
            code, resp = cls.owner.post("/api/v1/agents", {"agent_id": aid, "agent_type": atype,
                                                           "role": role, "issue_service_token": issue})
            if code not in (200, 201, 409):
                raise AssertionError(f"agent {aid} create failed HTTP {code}: {resp}")
            if issue and isinstance(resp, dict) and resp.get("service_token"):
                cls.tokens[aid] = resp["service_token"]
        if "ENGINE-01" not in cls.tokens:
            # 409 复用形态（测试 DB 全新不该发生，fail-fast 暴露假设）
            raise AssertionError("ENGINE-01 service token not issued on fresh test DB")
        # 测试隔离：重定向 review_leg 模块级目录常量
        cls.orig_runtime = rl.RUNTIME_DIR
        cls.orig_dispatch_logs = rl.DISPATCH_LOG_DIR
        rl.RUNTIME_DIR = cls.tmp / "runtime"
        rl.DISPATCH_LOG_DIR = cls.tmp / "dispatch-logs"
        # 项目/批次
        code, resp = cls.owner.post("/api/v1/projects", {
            "project_id": "PRJ-RVLTEST", "name": "review-leg tests",
            "description": "b-20261115-gpt03-review-leg S1 test project"})
        if code not in (200, 201, 409):
            raise AssertionError(f"project create failed HTTP {code}: {resp}")
        code, resp = cls.owner.post("/api/v1/batches", {
            "project_id": "PRJ-RVLTEST", "requirement": "review-leg test batch",
            "engineering_standard_version": "1.0.0", "knowledge_base_commit": "0" * 40})
        if code not in (200, 201):
            raise AssertionError(f"batch create failed HTTP {code}: {resp}")
        cls.batch_id = resp.get("batch_id") or resp.get("id")
        # git 夹具仓库
        cls.fixture = cls.tmp / "fixture-repo"
        cls.fixture.mkdir(parents=True)
        env = {**os.environ, "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@example.com",
               "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@example.com"}
        def git(*a, cwd=None):
            p = subprocess.run(["git", "-C", str(cwd or cls.fixture), *a], capture_output=True,
                               env=env, text=True, encoding="utf-8", errors="replace")
            if p.returncode != 0:
                raise AssertionError(f"git {a[:2]} failed: {p.stderr}")
            return p.stdout
        cls.git = staticmethod(git)
        git("init", "-b", "main")
        (cls.fixture / "app.txt").write_text("base line\n", encoding="utf-8")
        git("add", ".")
        git("commit", "-m", "base")
        cls.base_commit = git("rev-parse", "HEAD").strip()
        # 仓库（commit 登记前置；夹具目录就位后创建）
        code, resp = cls.owner.post("/api/v1/repositories", {
            "project_id": "PRJ-RVLTEST", "url": "file:///rvl-fixture",
            "local_path": str(cls.fixture), "default_branch": "main"})
        if code not in (200, 201, 409):
            raise AssertionError(f"repository create failed HTTP {code}: {resp}")
        cls.repo_id = resp.get("repository_id") or resp.get("id")

    @classmethod
    def tearDownClass(cls):
        cls.server.stop()
        rl.RUNTIME_DIR = cls.orig_runtime
        rl.DISPATCH_LOG_DIR = cls.orig_dispatch_logs
        with contextlib.suppress(Exception):
            import shutil
            shutil.rmtree(cls.tmp, ignore_errors=True)

    # ------------------------------------------------------------------
    # 夹具：每测试独立 DEV_REPORTED 任务（含真实 commit + diff artifact）
    # ------------------------------------------------------------------
    def make_leg(self, tag: str, reply_fn=None, fail_first_send: bool = False):
        self._leg_seq = getattr(self.__class__, "_leg_seq", 0) + 1
        self.__class__._leg_seq = self._leg_seq
        run_key = f"902{self._leg_seq:03d}"
        """建任务→推进 DEV_REPORTED→返回 (leg, task_id, patch_path, dispatch_ctx, commit)。
        reply_fn=callable(commit)->reply 文本（派单替身回复；None=不安装替身）。"""
        commit_file = self.fixture / f"work-{tag}.txt"
        commit_file.write_text(f"change for {tag}\n", encoding="utf-8")
        self.git("add", ".")
        self.git("commit", "-m", f"work {tag}")
        commit = self.git("rev-parse", "HEAD").strip()
        patch_path = self.tmp / f"patch-{tag}.patch"
        patch_path.write_text(self.git("diff", f"{commit}~1", commit), encoding="utf-8")

        code, resp = self.owner.post("/api/v1/tasks", {
            "batch_id": self.batch_id, "title": f"rvl test task {tag}",
            "description": "review leg test task", "priority": "P1",
            "files_scope": [f"work-{tag}.txt"],
            "acceptance_criteria": [f"work-{tag}.txt contains change for {tag}"],
            "engineering_standard_version": "1.0.0",
            "knowledge_base_commit": self.base_commit, "dependencies": []})
        self.assertEqual(code, 201, f"task create: {resp}")
        task_id = resp.get("task_id") or resp.get("id")
        for event, tail in (("PLAN", "01"), ("ARCH_REVIEW", "02"), ("PASS", "03")):
            code, resp = self.owner.post(f"/api/v1/tasks/{task_id}/events",
                                         {"event": event, "event_id": f"EVT-FIX-{tag}-{tail}"})
            self.assertIn(code, (200, 201), f"fixture event {event}: {resp}")
        code, resp = self.owner.post(f"/api/v1/tasks/{task_id}/claim", {
            "agent_id": "DEV-EXEC-01", "base_commit": self.base_commit,
            "correlation_id": "CORR-990001"})
        self.assertIn(code, (200, 201), f"claim: {resp}")
        execution_id = resp.get("execution_id") or ((resp.get("task") or {}).get("latest_execution") or {}).get("execution_id")
        code, resp = self.owner.post(f"/api/v1/tasks/{task_id}/events",
                                     {"event": "START", "event_id": f"EVT-FIX-{tag}-START"})
        self.assertIn(code, (200, 201))
        code, art = self.owner.post("/api/v1/artifacts", {
            "task_id": task_id, "type": "DIFF", "path": f"evidence/patch-{tag}.patch",
            "sha256": __import__("hashlib").sha256(patch_path.read_bytes()).hexdigest()})
        self.assertIn(code, (200, 201, 202), f"artifact: {art}")
        artifact_id = art.get("artifact_id") or art.get("id")
        code, resp = self.owner.post("/api/v1/commits", {
            "task_id": task_id, "execution_id": execution_id,
            "repository_id": self.repo_id, "branch": "main", "sha": commit,
            "base_commit": self.base_commit, "diff_artifact_id": artifact_id})
        self.assertIn(code, (200, 201, 202), f"commit register: {resp}")
        code, resp = self.owner.post(f"/api/v1/tasks/{task_id}/events",
                                     {"event": "DEVELOPMENT_COMPLETED",
                                      "event_id": f"EVT-FIX-{tag}-DEV"})
        self.assertIn(code, (200, 201), f"DEV_REPORTED advance: {resp}")

        leg = rl.ReviewLeg(run_key=run_key, task_id=task_id,
                           project_id="PRJ-RVLTEST",
                           reviewed_commit=commit, diff_artifact_id=artifact_id,
                           diff_file=patch_path, fixture_repo=self.fixture,
                           m1_url=self.server.base, token=self.tokens["ENGINE-01"],
                           marker_text=f"[GPT03-R1|{tag}]")
        ctx = None
        if reply_fn is not None:
            wrapper, calls = make_dispatch_double(reply_fn(commit), rl.DISPATCH_LOG_DIR,
                                                  fail_first=fail_first_send)
            ctx = (wrapper, calls)
        return leg, task_id, patch_path, ctx, commit

    @contextlib.contextmanager
    def dispatch_double(self, wrapper):
        real_run = rl.subprocess.run
        rl.subprocess.run = wrapper
        try:
            yield
        finally:
            rl.subprocess.run = real_run

    _runner_reply = None

    def _write_runner(self, name, body, task_id, commit, patch_path, run_key):
        """生成独立 runner 脚本（真实子进程执行）。公共件=test_runner_common（真实模块
        import，无字符串拼接缩进问题）。"""
        tpl = """# -*- coding: utf-8 -*-
import json, os, sys
from pathlib import Path
sys.path.insert(0, r"__TOOLS__")
from test_runner_common import install_double

install_double(__REPLY__, Path(r"__DROOT__"), Path(r"__RUNTIME__"), Path(r"__OUTDIR__"))

__BODY__
"""
        tpl = tpl.replace("__TOOLS__", str(REPO_ROOT / "phase1" / "tools"))
        tpl = tpl.replace("__REPLY__", repr(self._runner_reply or ""))
        tpl = tpl.replace("__DROOT__", str(self.tmp / "dispatch-logs"))
        tpl = tpl.replace("__RUNTIME__", str(self.tmp / "runtime"))
        tpl = tpl.replace("__OUTDIR__", str(self.tmp / "runtime" / ("rvl-" + run_key)))
        tpl = tpl.replace("__BODY__", body)
        rp = self.tmp / name
        rp.write_text(tpl, encoding="utf-8")
        return rp

    def _run_runner(self, runner, token, task_id, commit, patch_path, run_key,
                    artifact_id=None, timeout=180):
        env = {**os.environ,
               "AIEO_PLATFORM_ADMIN_USERNAME": "OWNER",
               "AIEO_PLATFORM_ADMIN_PASSWORD": "rvl-test-admin-pw-2026-1115x"}
        cmd = [sys.executable, str(runner), self.server.base, token, task_id, commit,
               str(patch_path), run_key, artifact_id or ""]
        return subprocess.run(cmd, cwd=str(REPO_ROOT), capture_output=True, text=True,
                              encoding="utf-8", errors="replace", env=env, timeout=timeout)

    def _make_runner_leg(self, tag):
        """为 runner 准备独立任务与凭据（返回 task_id/commit/patch）。"""
        import hashlib
        commit_file = self.fixture / ("work-" + tag + ".txt")
        commit_file.write_text("change for " + tag + "\n", encoding="utf-8")
        self.git("add", ".")
        self.git("commit", "-m", "work " + tag)
        commit = self.git("rev-parse", "HEAD").strip()
        patch_path = self.tmp / ("patch-" + tag + ".patch")
        patch_path.write_text(self.git("diff", commit + "~1", commit), encoding="utf-8")
        code, resp = self.owner.post("/api/v1/tasks", {
            "batch_id": self.batch_id, "title": "rvl runner task " + tag,
            "description": "runner drill", "priority": "P1",
            "files_scope": ["work-" + tag + ".txt"],
            "acceptance_criteria": ["work-" + tag + ".txt ok"],
            "engineering_standard_version": "1.0.0",
            "knowledge_base_commit": self.base_commit, "dependencies": []})
        self.assertEqual(code, 201)
        task_id = resp.get("task_id") or resp.get("id")
        for event, tail in (("PLAN", "01"), ("ARCH_REVIEW", "02"), ("PASS", "03")):
            code, resp = self.owner.post("/api/v1/tasks/" + task_id + "/events",
                                         {"event": event, "event_id": "EVT-RN-" + tag + "-" + tail})
            self.assertIn(code, (200, 201))
        code, resp = self.owner.post("/api/v1/tasks/" + task_id + "/claim", {
            "agent_id": "DEV-EXEC-01", "base_commit": self.base_commit,
            "correlation_id": "CORR-997001"})
        self.assertIn(code, (200, 201))
        execution_id = resp.get("execution_id") or ((resp.get("task") or {}).get("latest_execution") or {}).get("execution_id")
        code, resp = self.owner.post("/api/v1/tasks/" + task_id + "/events",
                                     {"event": "START", "event_id": "EVT-RN-" + tag + "-START"})
        self.assertIn(code, (200, 201))
        code, art = self.owner.post("/api/v1/artifacts", {
            "task_id": task_id, "type": "DIFF", "path": "evidence/patch-" + tag + ".patch",
            "sha256": hashlib.sha256(patch_path.read_bytes()).hexdigest()})
        self.assertIn(code, (200, 201, 202))
        artifact_id = art.get("artifact_id") or art.get("id")
        code, resp = self.owner.post("/api/v1/commits", {
            "task_id": task_id, "execution_id": execution_id, "repository_id": self.repo_id,
            "branch": "main", "sha": commit, "base_commit": self.base_commit,
            "diff_artifact_id": artifact_id})
        self.assertIn(code, (200, 201, 202))
        code, resp = self.owner.post("/api/v1/tasks/" + task_id + "/events",
                                     {"event": "DEVELOPMENT_COMPLETED",
                                      "event_id": "EVT-RN-" + tag + "-DEV"})
        self.assertIn(code, (200, 201))
        return task_id, commit, patch_path, artifact_id

    @staticmethod
    def reply_for(commit: str, result: str = "PASS", extra: str = "") -> str:
        body = json.dumps({"result": result, "summary": "meets criteria" if result == "PASS"
                           else "missing test evidence",
                           "issues": [] if result == "PASS" else ["no test log registered"],
                           "reviewed_commit": commit}, ensure_ascii=False)
        return f"ChatGPT 说：\n```json\n{body}\n```{extra}"

    # ------------------------------------------------------------------
    # 附录 B 白名单客户端（fail-closed，网络请求前拦截）
    # ------------------------------------------------------------------
    def test_01_whitelist_client_guards(self):
        client = rl.EngineM1Client("http://127.0.0.1:1", "tok")
        # 允许：附录 B 8 端点形状
        for m, p in (("GET", "/api/v1/tasks/T-P1-001"),
                     ("GET", "/api/v1/tasks/T-P1-001/dependencies"),
                     ("GET", "/api/v1/artifacts/ART-DIFF-005"),
                     ("GET", "/api/v1/board"),
                     ("POST", "/api/v1/tasks/T-P1-001/events"),
                     ("POST", "/api/v1/artifacts"),
                     ("POST", "/api/v1/messages"),
                     ("POST", "/api/v1/reports/review")):
            client.check_whitelisted(m, p)  # 不抛即过
        # 拒绝：白名单外（管理类/审计/报告列表/approvals）
        for m, p in (("POST", "/api/v1/agents"),
                     ("GET", "/api/v1/reports"),
                     ("POST", "/api/v1/approvals"),
                     ("POST", "/api/v1/messages/MSG-1/ack"),
                     ("DELETE", "/api/v1/artifacts/x"),
                     ("POST", "/api/v1/projects")):
            with self.assertRaises(OrchestrationError) as cm:
                client.check_whitelisted(m, p)
            self.assertIn("whitelist", str(cm.exception))
        # 事件值：GIT_VALIDATE/PASS/REWORK 允许；BLOCKED/CANCEL 调用层禁止
        for ev in ("GIT_VALIDATE", "PASS", "REWORK"):
            rl.EngineM1Client.check_event(ev)
        for ev in ("BLOCKED", "CANCEL", "START", "DEVELOPMENT_COMPLETED"):
            with self.assertRaises(OrchestrationError) as cm:
                rl.EngineM1Client.check_event(ev)
            self.assertIn("forbidden", str(cm.exception))

    def test_02_idempotent_ids_deterministic(self):
        a = rl.ReviewLeg(run_key="901001", task_id="T-P1-001", project_id="PRJ-RVLTEST",
                         reviewed_commit="a" * 40, diff_artifact_id="ART-1",
                         diff_file=self.tmp / "x", fixture_repo=self.fixture,
                         m1_url=self.server.base, token="t")
        b = rl.ReviewLeg(run_key="901001", task_id="T-P1-001", project_id="PRJ-RVLTEST",
                         reviewed_commit="a" * 40, diff_artifact_id="ART-1",
                         diff_file=self.tmp / "x", fixture_repo=self.fixture,
                         m1_url=self.server.base, token="t")
        self.assertEqual(a.message_id(), b.message_id())
        self.assertRegex(a.message_id(), r"^MSG-\d{8}-\d{6}$")
        self.assertEqual(a.event_id("GIT_VALIDATE", "01"), b.event_id("GIT_VALIDATE", "01"))
        self.assertEqual(a.idem_keys["idempotency_key"], "901001-review-round-1")
        c = rl.ReviewLeg(run_key="901002", task_id="T-P1-001", project_id="PRJ-RVLTEST",
                         reviewed_commit="a" * 40, diff_artifact_id="ART-1",
                         diff_file=self.tmp / "x", fixture_repo=self.fixture,
                         m1_url=self.server.base, token="t")
        self.assertNotEqual(a.message_id(), c.message_id())

    # ------------------------------------------------------------------
    # A1 形状全流程（真实 M1/契约/Git；仅 ChatGPT 边界为替身）——PASS 结论
    # ------------------------------------------------------------------
    def test_03_full_flow_pass_registers_and_transitions(self):
        leg, task_id, _, ctx, commit = self.make_leg("f01", lambda c: self.reply_for(c, "PASS"))
        wrapper, calls = ctx
        with self.dispatch_double(wrapper):
            rc = leg.run()
        self.assertEqual(rc, 0, "run should PASS")
        task = self.server.query("SELECT status FROM tasks WHERE task_id=?", (task_id,))
        self.assertEqual(task[0]["status"], "TEST_ACCEPTANCE")
        reports = self.server.query("SELECT result,reviewed_commit FROM review_reports WHERE task_id=?", (task_id,))
        self.assertEqual(len(reports), 1)
        self.assertEqual(reports[0]["result"], "PASS")
        self.assertEqual(reports[0]["reviewed_commit"], commit)
        msgs = self.server.query("SELECT message_type FROM messages WHERE task_id=?", (task_id,))
        self.assertTrue(any(m["message_type"] == "CODE_REVIEW_SUBMITTED" for m in msgs))
        arts = self.server.query("SELECT type,sha256 FROM artifacts WHERE task_id=? AND type='REVIEW_EVIDENCE'", (task_id,))
        self.assertEqual(len(arts), 1)
        # 账本链完整（INTENT→CONFIRMED→CAPTURED→CONTRACT_VALID→ARTIFACT→MESSAGE→REPORT→FINAL）
        kinds = [r["kind"] for r in leg.ledger.load()]
        for k in ("R3_SEND_INTENT_RECORDED", "R3_SEND_CONFIRMED", "R4_REPLY_CAPTURED",
                  "R4_CONTRACT_VALID", "R5_ARTIFACT", "R5_MESSAGE", "R5_REPORT", "R6_FINAL_STATUS"):
            self.assertIn(k, kinds, f"ledger missing {k}")
        # 简报 ≤1200B 且含标记文本
        brief = (leg.run_dir / "brief.txt").read_text(encoding="utf-8")
        self.assertLessEqual(len(brief.encode("utf-8")), 1200)
        self.assertIn("[GPT03-R1|f01]", brief)
        self.assertEqual(calls["n"], 1, "exactly one dispatch (send) call")

    # ------------------------------------------------------------------
    # A2/A10 逻辑路径：REWORK 结论→REWORK 状态停等（无自动重开）
    # ------------------------------------------------------------------
    def test_04_rework_stops_without_reopen(self):
        leg, task_id, _, ctx, commit = self.make_leg("f02", lambda c: self.reply_for(c, "REWORK"))
        wrapper, calls = ctx
        with self.dispatch_double(wrapper):
            rc = leg.run()
        self.assertEqual(rc, 0)
        task = self.server.query("SELECT status FROM tasks WHERE task_id=?", (task_id,))
        self.assertEqual(task[0]["status"], "REWORK")
        self.assertEqual(calls["n"], 1)
        # A10：重启 resume → 终态 done，无新派单
        wrapper2, calls2 = make_dispatch_double("should-not-be-sent", rl.DISPATCH_LOG_DIR)
        with self.dispatch_double(wrapper2):
            rc2 = leg.resume()
        self.assertEqual(rc2, 0)
        self.assertEqual(calls2["n"], 0, "resume at REWORK must not dispatch")
        task = self.server.query("SELECT status FROM tasks WHERE task_id=?", (task_id,))
        self.assertEqual(task[0]["status"], "REWORK")

    # ------------------------------------------------------------------
    # 契约校验失败：保留原始 artifact，不登记成功结果，腿级 BLOCKED（L-008）
    # ------------------------------------------------------------------
    def test_05_contract_fail_keeps_raw_no_registration(self):
        bad_reply = "ChatGPT 说：我看完 diff 了，整体没问题。结果：PASS（非 JSON 自由文本）"
        leg, task_id, _, ctx, commit = self.make_leg("f03", lambda c: bad_reply)
        wrapper, _ = ctx
        with self.dispatch_double(wrapper):
            rc = leg.run()
        self.assertEqual(rc, 2, "contract failure -> leg-level BLOCKED")
        kinds = [r["kind"] for r in leg.ledger.load()]
        self.assertIn("LEG_LEVEL_BLOCKED", kinds)
        self.assertNotIn("R5_REPORT", kinds)
        reports = self.server.query("SELECT 1 FROM review_reports WHERE task_id=?", (task_id,))
        self.assertEqual(len(reports), 0, "no registration on contract failure")
        task = self.server.query("SELECT status FROM tasks WHERE task_id=?", (task_id,))
        self.assertEqual(task[0]["status"], "CODE_REVIEW", "M1 task unchanged (leg-level BLOCKED)")

    def test_05b_blocked_verdict_rejected(self):
        leg, task_id, _, ctx, commit = self.make_leg("f03b", lambda c: self.reply_for(c, "BLOCKED"))
        wrapper, _ = ctx
        with self.dispatch_double(wrapper):
            rc = leg.run()
        self.assertEqual(rc, 2, "BLOCKED verdict must not be registered by engine")
        reports = self.server.query("SELECT 1 FROM review_reports WHERE task_id=?", (task_id,))
        self.assertEqual(len(reports), 0)
        task = self.server.query("SELECT status FROM tasks WHERE task_id=?", (task_id,))
        self.assertEqual(task[0]["status"], "CODE_REVIEW")

    # ------------------------------------------------------------------
    # A4 幂等重放：同请求原文重放 → 幂等命中，无重复登记无新副作用
    # ------------------------------------------------------------------
    def test_06_replay_same_request_no_duplicates(self):
        leg, task_id, _, ctx, commit = self.make_leg("f04", lambda c: self.reply_for(c, "PASS"))
        wrapper, _ = ctx
        with self.dispatch_double(wrapper):
            self.assertEqual(leg.run(), 0)
        self._dispatch_dirs_before = len(list(rl.DISPATCH_LOG_DIR.glob("dispatch-*")))
        before = {
            "reports": self.server.query("SELECT COUNT(*) c FROM review_reports WHERE task_id=?", (task_id,))[0]["c"],
            "msgs": self.server.query("SELECT COUNT(*) c FROM messages WHERE task_id=? AND message_type='CODE_REVIEW_SUBMITTED'", (task_id,))[0]["c"],
            "arts": self.server.query("SELECT COUNT(*) c FROM artifacts WHERE task_id=? AND type='REVIEW_EVIDENCE'", (task_id,))[0]["c"],
        }
        # 重放同一登记请求原文（同幂等键/artifact 键/message_id/report 自然键）
        task = leg._refetch_task()
        captured = {"parsed": leg.extract_review_json(
            (leg.run_dir / "reply.txt").read_text(encoding="utf-8")),
            "envelope": json.loads((leg.run_dir / "ajv-input-envelope.json").read_text(encoding="utf-8")),
            "reply_sha256": __import__("hashlib").sha256((leg.run_dir / "reply.txt").read_bytes()).hexdigest()}
        leg.r5_register(task, captured)
        after = {
            "reports": self.server.query("SELECT COUNT(*) c FROM review_reports WHERE task_id=?", (task_id,))[0]["c"],
            "msgs": self.server.query("SELECT COUNT(*) c FROM messages WHERE task_id=? AND message_type='CODE_REVIEW_SUBMITTED'", (task_id,))[0]["c"],
            "arts": self.server.query("SELECT COUNT(*) c FROM artifacts WHERE task_id=? AND type='REVIEW_EVIDENCE'", (task_id,))[0]["c"],
        }
        self.assertEqual(before, after, "replay must not create duplicates")
        kinds = [r["kind"] for r in leg.ledger.load()]
        self.assertIn("R5_DUPLICATE_OK", kinds, "duplicate hit must be recorded as idempotent")
        # dispatch 目录计数不增（无新外部副作用；delta 断言排除历史测试目录）
        dispatch_dirs_after = list(rl.DISPATCH_LOG_DIR.glob("dispatch-*"))
        self.assertEqual(len(dispatch_dirs_after), self._dispatch_dirs_before,
                         "replay must not create new dispatch dirs")

    # ------------------------------------------------------------------
    # A7 事件幂等：R1 重复执行 → 同 event_id 单条，无第二事件副作用
    # ------------------------------------------------------------------
    def test_07_event_replay_single_row(self):
        leg, task_id, _, _, commit = self.make_leg("f05", lambda c: self.reply_for(c, "PASS"))
        wrapper, _ = make_dispatch_double(self.reply_for(commit, "PASS"), rl.DISPATCH_LOG_DIR)
        with self.dispatch_double(wrapper):
            self.assertEqual(leg.run(), 0)
        ev_id = leg.event_id("GIT_VALIDATE", "01")
        rows = self.server.query("SELECT COUNT(*) c FROM task_events WHERE task_id=? AND event_id=?", (task_id, ev_id))
        self.assertEqual(rows[0]["c"], 1, "same event_id must appear exactly once")
        # DEV_REPORTED 已过：对已推进任务重复 r1 → 状态核实路径 fail-closed（不伪造状态）
        leg2 = rl.ReviewLeg(run_key="909001", task_id=task_id, project_id="PRJ-RVLTEST",
                            reviewed_commit=commit, diff_artifact_id="ART-NONEXIST",
                            diff_file=self.tmp / "patch-f05.patch", fixture_repo=self.fixture,
                            m1_url=self.server.base, token=self.tokens["ENGINE-01"])
        with self.assertRaises(OrchestrationError):
            leg2.r1_git_validate_and_pass()

    # ------------------------------------------------------------------
    # A8 账本断裂：send intent 无 confirm → resume fail-closed（禁以缺失为由重发）
    # ------------------------------------------------------------------
    def test_08a_send_happened_ledger_broken_blocks(self):
        """A8 场景①（charter 附录 D A8）：发送已成立、发送后账本记录丢失（仅剩 INTENT）
        → resume 禁重发+腿级 BLOCKED+M1 状态不动；账本修复后续跑只补登记零发送。"""
        leg, task_id, _, ctx, commit = self.make_leg("f06a", lambda c: self.reply_for(c, "PASS"))
        wrapper, calls = ctx
        leg.r0_precheck()
        leg.r1_git_validate_and_pass()
        task = leg._refetch_task()
        leg.r2_compose_brief(task)
        with self.dispatch_double(wrapper):
            ddir = leg.r3_dispatch(leg.run_dir.joinpath("brief.txt").read_text(encoding="utf-8"))
        self.assertEqual(calls["n"], 1)
        # 发送断点后完成真实采集（reply 落盘+账本 R4 记录），为"账本修复后续跑只补登记"备料
        leg.r4_capture_and_validate(ddir, batch_id=task.get("batch_id"))
        recs = leg.ledger.load()
        cut = next(i for i, r in enumerate(recs) if r["kind"] == "R3_SEND_INTENT_RECORDED")
        kept = recs[:cut + 1]
        leg.ledger.path.write_text(
            "".join(json.dumps(r, ensure_ascii=False) + "\n" for r in kept), encoding="utf-8")
        wrapper2, calls2 = make_dispatch_double("should-not-be-sent", rl.DISPATCH_LOG_DIR)
        with self.dispatch_double(wrapper2):
            rc = leg.resume()
        self.assertEqual(rc, 2, "A8 broken ledger -> leg-level BLOCKED")
        self.assertEqual(calls2["n"], 0, "A8: must not redispatch (cannot prove send state)")
        self.assertEqual(self.server.query(
            "SELECT status FROM tasks WHERE task_id=?", (task_id,))[0]["status"],
            "CODE_REVIEW", "M1 task unchanged (leg-level BLOCKED)")
        blocked = leg.ledger.latest("LEG_LEVEL_BLOCKED")
        self.assertIn("cannot prove send state", blocked["reason"])
        # 账本修复（恢复完整记录）后同一账本续跑只补登记——BLOCKED 是保守态不是死锁
        leg.ledger.path.write_text(
            "".join(json.dumps(r, ensure_ascii=False) + "\n" for r in recs), encoding="utf-8")
        rc2 = leg.resume()
        self.assertEqual(rc2, 0, "restored ledger completes registration without new send")
        self.assertEqual(calls2["n"], 0, "recovery registration must not send")
        self.assertEqual(self.server.query(
            "SELECT status FROM tasks WHERE task_id=?", (task_id,))[0]["status"], "TEST_ACCEPTANCE")

    def test_08c_collect_failed_full_recovery(self):
        """NEW-P1-01 修复验证：发送双验过但采集失败（COLLECT_FAILED 落账会话证据）
        → resume 原会话补采（禁重发）→ 契约校验 → 只补登记 → 状态推进。全程零重发。"""
        import hashlib
        leg, task_id, _, ctx, commit = self.make_leg("f06c", lambda c: self.reply_for(c, "PASS"))
        reply_text = self.reply_for(commit, "PASS")
        sends = {"n": 0}

        def wrapper(cmd, **kw):
            joined = " ".join(map(str, cmd))
            if "gpt_dispatch.mjs" in joined:
                sends["n"] += 1
                ddir = rl.DISPATCH_LOG_DIR / f"dispatch-08c-{sends['n']}"
                ddir.mkdir(parents=True, exist_ok=True)
                msg_file = None
                cl = [str(a) for a in cmd]
                if "--message-file" in cl:
                    msg_file = Path(cl[cl.index("--message-file") + 1])
                if msg_file and msg_file.is_file():
                    (ddir / "request.txt").write_bytes(msg_file.read_bytes())
                # 发送双验证据先落盘（result.json），随后进程非零退出=采集失败（§5 行2 形态）
                (ddir / "result.json").write_text(json.dumps({
                    "user_unit_key": "fallback-turn-1:0:user",
                    "unit_count": 1,
                    "conversation_url": "https://chatgpt.com/c/22222222-3333-4444-8555-666666666666",
                    "completion_checks": {"send_double_verify": True},
                }, ensure_ascii=False), encoding="utf-8")
                return FakeProc(3, b"", b"injected collection failure after send double-verify")
            if "recoll_driver.mjs" in joined:
                # 补采替身（ChatGPT 采集边界）：落盘 recoll 产物到 run_dir（=驱动模板 OUT_DIR）
                reply_sha = hashlib.sha256(reply_text.encode("utf-8")).hexdigest()
                (leg.run_dir / "reply.txt").write_text(reply_text, encoding="utf-8")
                (leg.run_dir / "recoll-result.json").write_text(json.dumps({
                    "recollection": True, "located_user_unit_key": "fallback-turn-1:0:user",
                    "unit_count": 1, "reply_bytes": len(reply_text.encode("utf-8")),
                    "reply_sha256": reply_sha,
                    "checks": {"final_stop_button_not_visible": True, "tail_is_assistant": True,
                               "dil_uuid_present": True, "uuid_stable": True,
                               "stable_unit_read": True, "target_range_materialized": True,
                               "not_prev_reply_sha": True},
                    "stability": {"stable": True},
                    "conversation_url": "https://chatgpt.com/c/22222222-3333-4444-8555-666666666666",
                }, ensure_ascii=False), encoding="utf-8")
                (leg.run_dir / "units-diag.json").write_text(json.dumps([
                    {"key": "fallback-turn-1:0:user", "role": "user", "text_head": "brief"},
                    {"key": "fallback-turn-1:2:assistant", "role": "assistant", "text_head": "reply"},
                ], ensure_ascii=False), encoding="utf-8")
                return FakeProc(0)
            return REAL_SUBPROCESS_RUN(cmd, **kw)

        with self.dispatch_double(wrapper):
            rc = leg.run()
        self.assertEqual(rc, 2, "collect-failure -> leg-level BLOCKED (resend forbidden)")
        self.assertEqual(sends["n"], 1, "exactly one send attempt")
        cf = leg.ledger.latest("R3_SEND_CONFIRMED_COLLECT_FAILED")
        self.assertIsNotNone(cf)
        self.assertEqual(cf["conversation_uuid"], "22222222-3333-4444-8555-666666666666",
                         "COLLECT_FAILED must carry conversation evidence (P1-03)")
        self.assertEqual(cf["sent_user_unit_key"], "fallback-turn-1:0:user")
        # resume：COLLECT_FAILED 锚点 → 原会话补采 → 登记 → 推进（NEW-P1-01 修复前此处 TypeError 逸出）
        with self.dispatch_double(wrapper):
            rc2 = leg.resume()
        self.assertEqual(rc2, 0, "full recovery completes (NEW-P1-01 fixed)")
        self.assertEqual(sends["n"], 1, "recovery must not resend")
        self.assertEqual(self.server.query(
            "SELECT status FROM tasks WHERE task_id=?", (task_id,))[0]["status"], "TEST_ACCEPTANCE")
        kinds = [r["kind"] for r in leg.ledger.load()]
        self.assertIn("RESUME_COLLECT_OK", kinds)
        r4 = leg.ledger.latest("R4_REPLY_CAPTURED")
        self.assertEqual(r4["user_unit_counts"]["at_capture_materialized"], 1,
                         "capture-time user unit count recorded from units-diag")
        self.assertEqual(r4["user_unit_counts"]["at_capture_evidence_class"], "materialized")
        self.assertEqual(r4["user_unit_counts"]["target_matches_sent_key"], True,
                         "capture key must cross-check against sent key (P2-01)")
        self.assertEqual(r4["user_unit_counts"]["source"], "units-diag.json",
                         "count source must be the actual counting file")
        self.assertTrue(r4["snapshot"]["source"].startswith("recoll"))

    def test_08b_ledger_m1_contradiction_blocks(self):
        """A8 场景②：账本含派单痕迹而 M1 任务尚在 DEV_REPORTED=矛盾态 → fail-closed。"""
        leg, task_id, _, ctx, commit = self.make_leg("f06b", lambda c: self.reply_for(c, "PASS"))
        leg.ledger.append({"kind": "R3_SEND_INTENT_RECORDED", "attempt": 1, "outcome": "INTENT"})
        wrapper, calls = make_dispatch_double(self.reply_for(commit, "PASS"), rl.DISPATCH_LOG_DIR)
        with self.dispatch_double(wrapper):
            rc = leg.resume()
        self.assertEqual(rc, 2)
        self.assertEqual(calls["n"], 0, "contradiction: must not redispatch (A8)")
        blocked = leg.ledger.latest("LEG_LEVEL_BLOCKED")
        self.assertIn("contradiction", blocked["reason"])
        self.assertEqual(self.server.query(
            "SELECT status FROM tasks WHERE task_id=?", (task_id,))[0]["status"], "DEV_REPORTED")

    # ------------------------------------------------------------------
    # A9 部分登记：artifact 成功后中断 → 续跑补登记，成功项不覆盖
    # ------------------------------------------------------------------
    def test_09_partial_registration_resumes_without_redo(self):
        leg, task_id, _, ctx, commit = self.make_leg("f07", lambda c: self.reply_for(c, "PASS"))
        wrapper, _ = ctx
        # P2-02 服务端故障注入：M1 存储层触发器使 messages INSERT ABORT（服务端 500），
        # 客户端走完整真实 REST（M1 客户端零替换）；artifact 成功、message 失败=部分成功现场
        fconn = sqlite3.connect(self.server.db_path)
        try:
            fconn.execute("CREATE TABLE IF NOT EXISTS rvl_fault(state TEXT)")
            fconn.execute("DELETE FROM rvl_fault")
            fconn.execute("INSERT INTO rvl_fault VALUES('arm')")
            fconn.execute("CREATE TRIGGER IF NOT EXISTS rvl_fail_messages "
                          "BEFORE INSERT ON messages "
                          "WHEN (SELECT state FROM rvl_fault)='arm' "
                          "BEGIN SELECT RAISE(ABORT, 'rvl injected server-side messages failure'); END")
            fconn.commit()
        finally:
            fconn.close()
        with self.dispatch_double(wrapper):
            rc = leg.run()
        fconn = sqlite3.connect(self.server.db_path)
        try:
            fconn.execute("UPDATE rvl_fault SET state='disarm'")
            fconn.commit()
        finally:
            fconn.close()
        self.assertEqual(rc, 2, "server-side messages failure -> leg-level BLOCKED")
        arts = self.server.query("SELECT artifact_id,sha256 FROM artifacts WHERE task_id=? AND type='REVIEW_EVIDENCE'", (task_id,))
        self.assertEqual(len(arts), 1, "artifact persisted through partial failure")
        artifact_id_before = arts[0]["artifact_id"]
        kinds = [r["kind"] for r in leg.ledger.load()]
        self.assertIn("R5_ARTIFACT", kinds)
        self.assertNotIn("R5_MESSAGE", kinds)
        self.assertNotIn("R5_REPORT", kinds)
        # 续跑：逐项只读核实 → 只补缺项（message/report），artifact 保留原 ID（零重派）
        wrapper2, calls2 = make_dispatch_double("should-not-be-sent", rl.DISPATCH_LOG_DIR)
        with self.dispatch_double(wrapper2):
            rc2 = leg.resume()
        self.assertEqual(rc2, 0)
        self.assertEqual(calls2["n"], 0, "resume register must not re-dispatch")
        skip_recs = [r for r in leg.ledger.load() if r["kind"] == "R5_SKIP_VERIFIED"]
        self.assertTrue(any(r["what"] == "artifact" for r in skip_recs),
                        "artifact must be skip-verified (kept original ID), not re-POSTed")
        arts = self.server.query("SELECT artifact_id,sha256 FROM artifacts WHERE task_id=? AND type='REVIEW_EVIDENCE'", (task_id,))
        self.assertEqual(len(arts), 1)
        self.assertEqual(arts[0]["artifact_id"], artifact_id_before, "artifact id/content unchanged")
        self.assertEqual(self.server.query(
            "SELECT status FROM tasks WHERE task_id=?", (task_id,))[0]["status"], "TEST_ACCEPTANCE")

    def test_09b_message_ok_report_fail_resume_completes(self):
        """P1-02 补充分支：message 已成功而 report 登记失败 → resume 跳过前两项
        （指纹重算核实）只补 report → 推进完成，零重派。"""
        leg, task_id, _, ctx, commit = self.make_leg("f07b", lambda c: self.reply_for(c, "PASS"))
        wrapper, _ = ctx
        fconn = sqlite3.connect(self.server.db_path)
        try:
            fconn.execute("CREATE TABLE IF NOT EXISTS rvl_fault2(state TEXT)")
            fconn.execute("DELETE FROM rvl_fault2")
            fconn.execute("INSERT INTO rvl_fault2 VALUES('arm')")
            fconn.execute("CREATE TRIGGER IF NOT EXISTS rvl_fail_report "
                          "BEFORE INSERT ON review_reports "
                          "WHEN (SELECT state FROM rvl_fault2)='arm' "
                          "BEGIN SELECT RAISE(ABORT, 'rvl injected server-side report failure'); END")
            fconn.commit()
        finally:
            fconn.close()
        with self.dispatch_double(wrapper):
            rc = leg.run()
        fconn = sqlite3.connect(self.server.db_path)
        try:
            fconn.execute("UPDATE rvl_fault2 SET state='disarm'")
            fconn.commit()
        finally:
            fconn.close()
        self.assertEqual(rc, 2, "report registration failure -> leg-level BLOCKED")
        kinds = [r["kind"] for r in leg.ledger.load()]
        self.assertIn("R5_ARTIFACT", kinds)
        self.assertIn("R5_MESSAGE", kinds)
        self.assertNotIn("R5_REPORT", kinds)
        wrapper2, calls2 = make_dispatch_double("should-not-be-sent", rl.DISPATCH_LOG_DIR)
        with self.dispatch_double(wrapper2):
            rc2 = leg.resume()
        self.assertEqual(rc2, 0)
        self.assertEqual(calls2["n"], 0, "resume must not re-dispatch")
        skip_recs = [r for r in leg.ledger.load() if r["kind"] == "R5_SKIP_VERIFIED"]
        self.assertTrue(any(r["what"] == "artifact" for r in skip_recs))
        self.assertTrue(any(r["what"] == "message" for r in skip_recs),
                        "message must be skip-verified via canonical fingerprint recompute")
        msgs = self.server.query("SELECT COUNT(*) c FROM messages WHERE task_id=? AND message_type='CODE_REVIEW_SUBMITTED'", (task_id,))
        self.assertEqual(msgs[0]["c"], 1, "message not duplicated")
        self.assertEqual(self.server.query(
            "SELECT status FROM tasks WHERE task_id=?", (task_id,))[0]["status"], "TEST_ACCEPTANCE")

    # ------------------------------------------------------------------
    # R0 交叉核验与 Git 校验真实性
    # ------------------------------------------------------------------
    def test_10_diff_sha_mismatch_rejected(self):
        leg, task_id, patch_path, _, commit = self.make_leg("f08", None)
        tampered = self.tmp / "patch-tampered.patch"
        tampered.write_text(patch_path.read_text(encoding="utf-8") + "\n# tampered\n", encoding="utf-8")
        leg2 = rl.ReviewLeg(run_key="909002", task_id=task_id, project_id="PRJ-RVLTEST",
                            reviewed_commit=commit, diff_artifact_id=leg.diff_artifact_id,
                            diff_file=tampered, fixture_repo=self.fixture,
                            m1_url=self.server.base, token=self.tokens["ENGINE-01"])
        with self.assertRaises(OrchestrationError) as cm:
            leg2.r0_precheck()
        self.assertIn("sha mismatch", str(cm.exception))

    def test_10b_git_verify_missing_commit(self):
        leg, task_id, patch_path, _, commit = self.make_leg("f09", None)
        leg2 = rl.ReviewLeg(run_key="909003", task_id=task_id, project_id="PRJ-RVLTEST",
                            reviewed_commit="b" * 40, diff_artifact_id=leg.diff_artifact_id,
                            diff_file=patch_path, fixture_repo=self.fixture,
                            m1_url=self.server.base, token=self.tokens["ENGINE-01"])
        with self.assertRaises(OrchestrationError) as cm:
            leg2.git_verify()
        self.assertIn("exit", str(cm.exception))

    # ------------------------------------------------------------------
    # 简报 1200B 硬限 + 腿级 BLOCKED 语义
    # ------------------------------------------------------------------
    def test_11_brief_over_limit_fails_no_truncation(self):
        leg, task_id, patch_path, _, commit = self.make_leg("f10", None)
        leg.marker_text = "[GPT03-R1|" + "X" * 1300 + "]"
        task = leg._refetch_task()
        with self.assertRaises(OrchestrationError) as cm:
            leg.r2_compose_brief(task)
        self.assertIn("1200", str(cm.exception))
        # 确认 run_dir 下无截断产物
        self.assertFalse((leg.run_dir / "brief.txt").exists())

    def test_12_ledger_atomic_and_flags(self):
        leg, task_id, _, _, commit = self.make_leg("f11", None)
        leg.ledger.append({"kind": "A", "v": 1})
        leg.ledger.append({"kind": "B", "v": 2})
        lines = leg.ledger.path.read_text(encoding="utf-8").splitlines()
        self.assertEqual(len(lines), 2)
        recs = [json.loads(l) for l in lines]
        self.assertTrue(all("ts_utc" in r for r in recs))
        self.assertEqual(leg.ledger.state_flags()["B"]["v"], 2)
        self.assertEqual(leg.ledger.latest("A")["v"], 1)

    # ------------------------------------------------------------------
    # resume 矩阵行：TEST_ACCEPTANCE/REWORK/BLOCKED 终态处置
    # ------------------------------------------------------------------
    def test_13_resume_terminal_rows(self):
        leg, task_id, _, ctx, commit = self.make_leg("f12", lambda c: self.reply_for(c, "PASS"))
        wrapper, _ = ctx
        with self.dispatch_double(wrapper):
            self.assertEqual(leg.run(), 0)
        wrapper2, calls2 = make_dispatch_double("x", rl.DISPATCH_LOG_DIR)
        with self.dispatch_double(wrapper2):
            self.assertEqual(leg.resume(), 0)
        self.assertEqual(calls2["n"], 0)
        self.assertEqual(self.server.query("SELECT status FROM tasks WHERE task_id=?", (task_id,))[0]["status"],
                         "TEST_ACCEPTANCE")

    def test_13b_resume_blocked_row_engine_must_not_touch(self):
        leg, task_id, _, _, commit = self.make_leg("f13", None)
        # 推进到 GIT_VALIDATING 后由 OWNER 置 BLOCKED（合法出边；模拟任务级阻塞现场）
        code, resp = self.owner.post(f"/api/v1/tasks/{task_id}/events",
                                     {"event": "GIT_VALIDATE", "event_id": "EVT-FIX-f13-GV"})
        self.assertIn(code, (200, 201), f"GIT_VALIDATE: {resp}")
        code, resp = self.owner.post(f"/api/v1/tasks/{task_id}/events",
                                     {"event": "BLOCKED", "event_id": "EVT-OWNER-BLOCKED-01",
                                      "blocked_reason": "owner test", "blocked_owner": "OWNER",
                                      "unblock_condition": "manual owner review"})
        self.assertIn(code, (200, 201), f"owner BLOCKED advance: {resp}")
        rc = leg.resume()
        self.assertEqual(rc, 2)
        self.assertIn("OWNER", leg.ledger.latest("LEG_LEVEL_BLOCKED")["reason"])

    # ------------------------------------------------------------------
    # setup-agents 幂等（409 复用形态）
    # ------------------------------------------------------------------
    def test_14_setup_agents_idempotent(self):
        os.environ["AIEO_PLATFORM_ADMIN_USERNAME"] = "OWNER"
        os.environ["AIEO_PLATFORM_ADMIN_PASSWORD"] = "rvl-test-admin-pw-2026-1115x"
        orig_runtime = rl.RUNTIME_DIR
        rl.RUNTIME_DIR = self.tmp / "runtime-setup"
        rl.RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
        # 预置令牌库（setUpClass 已签发 ENGINE-01）：复用语义=409 时代理运行时令牌库
        (rl.RUNTIME_DIR / "service-tokens.json").write_text(
            json.dumps({"ENGINE-01": self.tokens["ENGINE-01"]}), encoding="utf-8")
        try:
            rc = rl.setup_agents(self.server.base)
            self.assertEqual(rc, 0)
            rc2 = rl.setup_agents(self.server.base)
            self.assertEqual(rc2, 0, "second run must reuse existing agents (409 RES-0002)")
            tok = json.loads((rl.RUNTIME_DIR / "service-tokens.json").read_text(encoding="utf-8"))
            self.assertIn("ENGINE-01", tok)
        finally:
            rl.RUNTIME_DIR = orig_runtime
            os.environ.pop("AIEO_PLATFORM_ADMIN_PASSWORD", None)

    # ------------------------------------------------------------------
    # 发送失败 vs 采集失败区分（§5 行1/行2）
    # ------------------------------------------------------------------
    def test_16b_missing_send_anchor_fails_closed(self):
        """P2-01 缺键处置（R4 复验残留）：自动路径无发送锚点→r4 fail-closed（None 不得
        视为已完成交叉核验）；attach 人工路径显式登记 not_applicable 不误报。"""
        leg, task_id, patch_path, _, commit = self.make_leg("f16", None)
        stage = leg.run_dir / "staged"
        stage.mkdir(parents=True, exist_ok=True)
        (stage / "reply.txt").write_text(self.reply_for(commit, "PASS"), encoding="utf-8")
        task = leg._refetch_task()
        # 自动路径（默认 allow_no_anchor=False）：账本无 R3 发送锚点 → fail-closed
        with self.assertRaises(OrchestrationError) as cm:
            leg.r4_capture_and_validate(stage, batch_id=task.get("batch_id"))
        self.assertIn("fail-closed", str(cm.exception))
        # attach 人工路径：显式 not_applicable，不异常
        captured = leg.r4_capture_and_validate(stage, batch_id=task.get("batch_id"),
                                               allow_no_anchor=True)
        rec = leg.ledger.latest("R4_REPLY_CAPTURED")
        self.assertTrue(str(rec["user_unit_counts"]["target_matches_sent_key"]).startswith("not_applicable"),
                        "attach without any leg send must be explicitly not_applicable")
        self.assertIsNotNone(captured)

    # ------------------------------------------------------------------
    # A7/A5② 真实进程重启现场（S2-R1 P2-02/P2-03 整改）：runner 子进程=真实独立进程，
    # 中断用 os._exit（现场不落终态）；resume 由第二个全新子进程执行（真·进程重启）。
    # ------------------------------------------------------------------
    def test_17_a7_real_process_restart_event_idempotent(self):
        """A7 真实现场：子进程提交 GIT_VALIDATE 后 os._exit（M1 已提交、客户端进程死）
        → 全新子进程 resume → 只读核实接续 → task_events 同 event_id 恰 1 条。"""
        self._runner_reply = ""
        task_id, commit, patch_path, artifact_id = self._make_runner_leg("rn17")
        self._runner_reply = self.reply_for(commit, "PASS")
        run_key = "997017"
        token = self.tokens["ENGINE-01"]
        body1 = (
            "ART_ID = sys.argv[7]\n"
            "from review_leg import ReviewLeg\n"
            "leg = ReviewLeg(run_key=" + repr(run_key) + ", task_id=" + repr(task_id) +
            ", project_id='PRJ-RVLTEST',\n"
            "    reviewed_commit=" + repr(commit) + ", diff_artifact_id=ART_ID,\n"
            "    diff_file=Path(" + repr(str(patch_path)) + "), fixture_repo=Path(" + repr(str(self.fixture)) + "),\n"
            "    m1_url=sys.argv[1], token=sys.argv[2],\n"
            "    marker_text='[GPT03-R1|" + run_key + "|" + task_id + "]')\n"
            "leg.r0_precheck()\n"
            "orig_post = leg.engine.post\n"
            "def post_die(path, body, timeout=60.0):\n"
            "    r = orig_post(path, body, timeout)\n"
            "    if path.endswith('/events') and body.get('event') == 'GIT_VALIDATE':\n"
            "        os._exit(9)\n"
            "    return r\n"
            "leg.engine.post = post_die\n"
            "leg.r1_git_validate_and_pass()\n"
            "print('RUNNER1_UNEXPECTED_COMPLETION')\n"
        )
        r1 = self._write_runner("runner-a7-run.py", body1, task_id, commit, patch_path, run_key)
        proc1 = self._run_runner(r1, token, task_id, commit, patch_path, run_key, artifact_id)
        self.assertEqual(proc1.returncode, -9 if os.name != 'nt' else 9,
                         "runner1 dies at A7 injection (os._exit(9)); stdout=" + proc1.stdout[-600:]
                         + " stderr=" + proc1.stderr[-600:])
        body2 = (
            "ART_ID = sys.argv[7]\n"
            "from review_leg import ReviewLeg\n"
            "leg = ReviewLeg(run_key=" + repr(run_key) + ", task_id=" + repr(task_id) +
            ", project_id='PRJ-RVLTEST',\n"
            "    reviewed_commit=" + repr(commit) + ", diff_artifact_id=ART_ID,\n"
            "    diff_file=Path(" + repr(str(patch_path)) + "), fixture_repo=Path(" + repr(str(self.fixture)) + "),\n"
            "    m1_url=sys.argv[1], token=sys.argv[2],\n"
            "    marker_text='[GPT03-R1|" + run_key + "|" + task_id + "]')\n"
            "rc = leg.resume()\n"
            "print('RUNNER2_RC=' + str(rc))\n"
            "assert rc == 0, 'resume failed'\n"
        )
        r2 = self._write_runner("runner-a7-resume.py", body2, task_id, commit, patch_path, run_key)
        proc2 = self._run_runner(r2, token, task_id, commit, patch_path, run_key, artifact_id)
        self.assertIn("RUNNER2_RC=0", proc2.stdout,
                      "resume runner failed: " + proc2.stdout[-500:] + proc2.stderr[-400:])
        ev_id = "EVT-RVL-" + run_key + "-GIT_VALIDATE-01"
        rows = self.server.query(
            "SELECT COUNT(*) c FROM task_events WHERE task_id=? AND event_id=?", (task_id, ev_id))
        self.assertEqual(rows[0]["c"], 1, "A7: same event_id exactly once after real restart")
        self.assertEqual(self.server.query(
            "SELECT status FROM tasks WHERE task_id=?", (task_id,))[0]["status"], "TEST_ACCEPTANCE")

    def test_18_a5b_real_process_restart_register_only(self):
        """A5② 真实现场：子进程完成采集（reply 落盘+R4 账本）后 os._exit（登记未完成）
        → 全新子进程 resume → 仅补登记（零重派）→ 推进 TEST_ACCEPTANCE。"""
        task_id, commit, patch_path, artifact_id = self._make_runner_leg("rn18")
        self._runner_reply = self.reply_for(commit, "PASS")
        run_key = "997018"
        token = self.tokens["ENGINE-01"]
        body1 = (
            "ART_ID = sys.argv[7]\n"
            "from review_leg import ReviewLeg\n"
            "leg = ReviewLeg(run_key=" + repr(run_key) + ", task_id=" + repr(task_id) +
            ", project_id='PRJ-RVLTEST',\n"
            "    reviewed_commit=" + repr(commit) + ", diff_artifact_id=ART_ID,\n"
            "    diff_file=Path(" + repr(str(patch_path)) + "), fixture_repo=Path(" + repr(str(self.fixture)) + "),\n"
            "    m1_url=sys.argv[1], token=sys.argv[2],\n"
            "    marker_text='[GPT03-R1|" + run_key + "|" + task_id + "]')\n"
            "leg.r0_precheck()\n"
            "leg.r1_git_validate_and_pass()\n"
            "task = leg._refetch_task()\n"
            "leg.r2_compose_brief(task)\n"
            "ddir = leg.r3_dispatch(leg.run_dir.joinpath('brief.txt').read_text(encoding='utf-8'))\n"
            "leg.r4_capture_and_validate(ddir, batch_id=task.get('batch_id'))\n"
            "os._exit(9)\n"
        )
        r1 = self._write_runner("runner-a5b-run.py", body1, task_id, commit, patch_path, run_key)
        proc1 = self._run_runner(r1, token, task_id, commit, patch_path, run_key, artifact_id)
        self.assertIn(proc1.returncode, (-9, 9),
                      "runner1 dies at A5② breakpoint (os._exit(9))")
        body2 = (
            "ART_ID = sys.argv[7]\n"
            "from review_leg import ReviewLeg\n"
            "leg = ReviewLeg(run_key=" + repr(run_key) + ", task_id=" + repr(task_id) +
            ", project_id='PRJ-RVLTEST',\n"
            "    reviewed_commit=" + repr(commit) + ", diff_artifact_id=ART_ID,\n"
            "    diff_file=Path(" + repr(str(patch_path)) + "), fixture_repo=Path(" + repr(str(self.fixture)) + "),\n"
            "    m1_url=sys.argv[1], token=sys.argv[2],\n"
            "    marker_text='[GPT03-R1|" + run_key + "|" + task_id + "]')\n"
            "rc = leg.resume()\n"
            "print('RUNNER2_RC=' + str(rc))\n"
            "assert rc == 0, 'resume failed'\n"
        )
        r2 = self._write_runner("runner-a5b-resume.py", body2, task_id, commit, patch_path, run_key)
        proc2 = self._run_runner(r2, token, task_id, commit, patch_path, run_key, artifact_id)
        self.assertIn("RUNNER2_RC=0", proc2.stdout,
                      "resume runner failed: " + proc2.stdout[-500:] + proc2.stderr[-400:])
        self.assertEqual(self.server.query(
            "SELECT COUNT(*) c FROM review_reports WHERE task_id=?", (task_id,))[0]["c"], 1)
        self.assertEqual(self.server.query(
            "SELECT COUNT(*) c FROM messages WHERE task_id=? AND message_type='CODE_REVIEW_SUBMITTED'",
            (task_id,))[0]["c"], 1)
        self.assertEqual(self.server.query(
            "SELECT status FROM tasks WHERE task_id=?", (task_id,))[0]["status"], "TEST_ACCEPTANCE")

    def test_16c_confirmed_send_missing_key_fails_closed_even_attach(self):
        """S2-R1 P1-01 反例：已确认发送（CONFIRMED）但发送键缺失时，即便 attach 人工路径
        也必须 fail-closed（不可 not_applicable）；纯发送失败后 attach 才允许显式登记。"""
        leg, task_id, patch_path, _, commit = self.make_leg("f16c", None)
        stage = leg.run_dir / "staged16c"
        stage.mkdir(parents=True, exist_ok=True)
        (stage / "reply.txt").write_text(self.reply_for(commit, "PASS"), encoding="utf-8")
        task = leg._refetch_task()
        # 场景A：账本有 CONFIRMED 但 sent_user_unit_key 缺失 → attach 也 fail-closed
        leg.ledger.append({"kind": "R3_SEND_CONFIRMED", "attempt": 1,
                           "dispatch_dir": "dispatch-x", "conversation_uuid": "u1",
                           "sent_user_unit_key": None, "outcome": "CONFIRMED"})
        with self.assertRaises(OrchestrationError) as cm:
            leg.r4_capture_and_validate(stage, batch_id=task.get("batch_id"), allow_no_anchor=True)
        self.assertIn("fail-closed", str(cm.exception))
        # 场景B：仅失败尝试（SEND_FAILED，无成功发送）→ attach 允许显式 not_applicable
        leg2, task2, _, _, commit2 = self.make_leg("f16d", None)
        leg2.ledger.append({"kind": "R3_SEND_FAILED", "attempt": 1, "error": "x", "outcome": "FAIL"})
        stage2 = leg2.run_dir / "staged16d"
        stage2.mkdir(parents=True, exist_ok=True)
        (stage2 / "reply.txt").write_text(self.reply_for(commit2, "PASS"), encoding="utf-8")
        task2v = leg2._refetch_task()
        captured2 = leg2.r4_capture_and_validate(stage2, batch_id=task2v.get("batch_id"),
                                                 allow_no_anchor=True)
        rec = leg2.ledger.latest("R4_REPLY_CAPTURED")
        self.assertTrue(str(rec["user_unit_counts"]["target_matches_sent_key"]).startswith("not_applicable"),
                        "failed-send-only attach must be explicitly not_applicable")
        self.assertIsNotNone(captured2)

    def test_19_a5_combination_evidence_process_death_verified(self):
        """A5① 组合证据（会商乙方案裁定）：runner 独立进程于"发送确认后、reply 采集前"
        （账本状态事件=CONFIRMED 落账、R4_REPLY_CAPTURED 未落账）os._exit；父测试双重
        验证进程树死亡（returncode+tasklist 独立存活检查）；全新子进程 resume 走补采→
        补登记→推进（零重派）。丙修正口径：组合证据，不得表述为一次真实派单现场完整捕获。"""
        task_id, commit, patch_path, artifact_id = self._make_runner_leg("rn19")
        self._runner_reply = self.reply_for(commit, "PASS")
        run_key = "997019"
        token = self.tokens["ENGINE-01"]
        body1 = (
            "ART_ID = sys.argv[7]\n"
            "from review_leg import ReviewLeg\n"
            "leg = ReviewLeg(run_key=" + repr(run_key) + ", task_id=" + repr(task_id) +
            ", project_id='PRJ-RVLTEST',\n"
            "    reviewed_commit=" + repr(commit) + ", diff_artifact_id=ART_ID,\n"
            "    diff_file=Path(" + repr(str(patch_path)) + "), fixture_repo=Path(" + repr(str(self.fixture)) + "),\n"
            "    m1_url=sys.argv[1], token=sys.argv[2],\n"
            "    marker_text='[GPT03-R1|" + run_key + "|" + task_id + "]')\n"
            "leg.r0_precheck()\n"
            "leg.r1_git_validate_and_pass()\n"
            "task = leg._refetch_task()\n"
            "leg.r2_compose_brief(task)\n"
            "leg.r3_dispatch(leg.run_dir.joinpath('brief.txt').read_text(encoding='utf-8'))\n"
            "# A5① 断点：发送确认已落账（CONFIRMED）、reply 采集动作未执行（R4 未落账）\n"
            "kinds = [json.loads(l)['kind'] for l in leg.ledger.path.read_text(encoding='utf-8').splitlines() if l.strip()]\n"
            "assert 'R3_SEND_CONFIRMED' in kinds and 'R4_REPLY_CAPTURED' not in kinds, kinds\n"
            "print('BREAKPOINT_STATE_OK', flush=True)\n"
            "Path(leg.run_dir / 'runner-pid.json').write_text(json.dumps({'pid': os.getpid()}), encoding='utf-8')\n"
            "os._exit(9)\n"
        )
        r1 = self._write_runner("runner-a5c-run.py", body1, task_id, commit, patch_path, run_key)
        import time as _t
        self._t19_dirs_before = len(list(rl.DISPATCH_LOG_DIR.glob("dispatch-runner-*")))
        proc1 = self._run_runner(r1, token, task_id, commit, patch_path, run_key, artifact_id, timeout=180)
        self.assertIn("BREAKPOINT_STATE_OK", proc1.stdout,
                      "breakpoint state must be confirmed before exit; stdout=" + proc1.stdout[-400:]
                      + " stderr=" + proc1.stderr[-600:])
        self.assertEqual(proc1.returncode, -9 if os.name != "nt" else 9,
                         "runner1 dies after send confirmation, before capture")
        # 双重验证：独立存活检查（tasklist 全量）——进程树死亡证据（会商要求；
        # runner 自报 PID=唯一可靠来源，父进程无法可靠枚举子进程 PID）
        dirs_after_r1 = len(list(rl.DISPATCH_LOG_DIR.glob("dispatch-runner-*")))  # runner1 派单合法
        pid_rec = json.loads((Path(self.tmp) / "runtime" / ("rvl-" + run_key) / "runner-pid.json").read_text(encoding="utf-8"))
        r = subprocess.run(["tasklist", "/FO", "CSV", "/NH"], capture_output=True, text=True, timeout=30)
        self.assertNotIn(str(pid_rec["pid"]), r.stdout,
                         "process tree death independently verified via tasklist (runner-reported pid)")
        snap = {"runner_pid": pid_rec["pid"], "exit_code": proc1.returncode,
                "tasklist_verify": "pid absent (independent alive-check)",
                "breakpoint": "R3_SEND_CONFIRMED present / R4_REPLY_CAPTURED absent",
                "combination_evidence_note": "组合证据（会商乙方案）：本测试+918012真实链+test_18恢复语义，"
                                             "不得表述为一次真实派单现场完整捕获",
                "verified_at": _t.strftime("%Y-%m-%dT%H:%M:%S", _t.gmtime()) + "Z"}
        (Path(self.tmp) / "runtime" / "a5-combination-snapshot.json").write_text(
            json.dumps(snap, ensure_ascii=False, indent=2), encoding="utf-8")
        # 全新子进程 resume：CONFIRMED 有/R4 无 → _resume_collect（补采替身）→ 补登记 → 推进
        body2 = (
            "ART_ID = sys.argv[7]\n"
            "from review_leg import ReviewLeg\n"
            "leg = ReviewLeg(run_key=" + repr(run_key) + ", task_id=" + repr(task_id) +
            ", project_id='PRJ-RVLTEST',\n"
            "    reviewed_commit=" + repr(commit) + ", diff_artifact_id=ART_ID,\n"
            "    diff_file=Path(" + repr(str(patch_path)) + "), fixture_repo=Path(" + repr(str(self.fixture)) + "),\n"
            "    m1_url=sys.argv[1], token=sys.argv[2],\n"
            "    marker_text='[GPT03-R1|" + run_key + "|" + task_id + "]')\n"
            "rc = leg.resume()\n"
            "print('RUNNER2_RC=' + str(rc))\n"
            "assert rc == 0, 'resume failed'\n"
        )
        r2 = self._write_runner("runner-a5c-resume.py", body2, task_id, commit, patch_path, run_key)
        proc2 = self._run_runner(r2, token, task_id, commit, patch_path, run_key, artifact_id, timeout=240)
        self.assertIn("RUNNER2_RC=0", proc2.stdout,
                      "resume runner failed: " + proc2.stdout[-500:] + proc2.stderr[-400:])
        kinds = [r["kind"] for r in (self.server and [])]  # placeholder no-op
        led = json.loads(json.dumps([]))
        self.assertEqual(self.server.query(
            "SELECT COUNT(*) c FROM review_reports WHERE task_id=?", (task_id,))[0]["c"], 1)
        self.assertEqual(self.server.query(
            "SELECT COUNT(*) c FROM messages WHERE task_id=? AND message_type='CODE_REVIEW_SUBMITTED'",
            (task_id,))[0]["c"], 1)
        # 零重派断言：test_19 全程 dispatch 目录数 delta=0（resume 走补采路径，无新派单）
        dispatch_dirs = list(rl.DISPATCH_LOG_DIR.glob("dispatch-runner-*"))
        self.assertEqual(len(dispatch_dirs), dirs_after_r1,
                         "A5① combination: resume must not re-dispatch (zero delta after breakpoint)")
        self.assertEqual(self.server.query(
            "SELECT status FROM tasks WHERE task_id=?", (task_id,))[0]["status"], "TEST_ACCEPTANCE")

    def test_16d_intent_only_attach_fails_closed(self):
        """S2-R2 NEW-P1-01 反例：INTENT-only（发送状态不确定）即便 attach 也必须
        fail-closed；纯 FAILED 后 attach 才显式 not_applicable。"""
        leg, task_id, patch_path, _, commit = self.make_leg("f16e", None)
        stage = leg.run_dir / "staged16e"
        stage.mkdir(parents=True, exist_ok=True)
        (stage / "reply.txt").write_text(self.reply_for(commit, "PASS"), encoding="utf-8")
        task = leg._refetch_task()
        leg.ledger.append({"kind": "R3_SEND_INTENT_RECORDED", "attempt": 1, "outcome": "INTENT"})
        with self.assertRaises(OrchestrationError) as cm:
            leg.r4_capture_and_validate(stage, batch_id=task.get("batch_id"), allow_no_anchor=True)
        self.assertIn("send state uncertain", str(cm.exception))

    def test_16_report_key_evidence_rejects_wrong_commit(self):
        """NEW-P1-02 反例：report 409 响应中 commit 前缀与本方 reviewed_commit 不一致
        → key_evidence 必须拒绝（fail-closed），不得仅凭 execution_id 匹配放行。"""
        leg, task_id, _, _, commit = self.make_leg("f15", None)
        check = leg._report_key_evidence("EXEC-099")
        good = {"code": "RES-0003", "details": {"execution_id": "EXEC-099"},
                "message": "DUPLICATE_MESSAGE: review report for (EXEC-099, "
                           f"{commit[:12]}..) already registered"}
        bad = {"code": "RES-0003", "details": {"execution_id": "EXEC-099"},
               "message": "DUPLICATE_MESSAGE: review report for (EXEC-099, "
                          "bbbbbbbbbbbb..) already registered"}
        self.assertTrue(check(good), "matching commit prefix must be accepted")
        self.assertFalse(check(bad), "wrong commit prefix must be rejected (NEW-P1-02)")
        wrong_exec = {"code": "RES-0003", "details": {"execution_id": "EXEC-111"},
                      "message": "review report for (EXEC-111, "
                                 f"{commit[:12]}..) already registered"}
        self.assertFalse(check(wrong_exec), "wrong execution must be rejected")

    def test_15_send_failure_one_redispatch_then_blocked(self):
        leg, task_id, _, ctx, commit = self.make_leg("f14", lambda c: self.reply_for(c, "PASS"),
                                                     fail_first_send=True)
        wrapper, calls = ctx
        with self.dispatch_double(wrapper):
            rc = leg.run()
        self.assertEqual(rc, 0, "second attempt should succeed (§5 row1: one redispatch)")
        self.assertEqual(calls["n"], 2)
        kinds = [r["kind"] for r in leg.ledger.load()]
        self.assertIn("R3_SEND_FAILED", kinds)
        self.assertIn("R3_REDISPATCH_INTENT", kinds)


if __name__ == "__main__":
    unittest.main(verbosity=2)
