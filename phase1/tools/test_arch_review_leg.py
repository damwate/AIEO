# -*- coding: utf-8 -*-
"""GPT-02 架构审核真实腿测试矩阵（b-20261116-gpt02-arch-review-leg S3）。

charter v0.3 §7 验收映射：A1 正常审核轮（PASS→READY）／A2 返工（REWORK→REWORK 停等）／
A3 采集 fail-closed 恢复（禁重发证明）／A4 幂等重放／A5 断点恢复（含路线 B 专属行）／
A6 人工退路 attach-reply／A7 BLOCKED 仅登记不推进。负例：白名单越权/契约校验失败/
简报超限/材料不在锚定 commit/发送状态不确定 fail-closed。

M1 测试实例=独立临时 DB（908 DB 零接触）；ChatGPT 边界唯一替身=拦截 gpt_dispatch
（make_dispatch_double 复用 review_leg 测试基建），git/Ajv 原样真实执行。
"""

from __future__ import annotations

import contextlib
import json
import os
import subprocess
import sqlite3
import sys
import tempfile
import time
import unittest
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))

import arch_review_leg as ar  # noqa: E402
import review_leg as rl  # noqa: E402
from scheduler import M1Client, OrchestrationError  # noqa: E402
from test_review_leg import M1TestServer, FakeProc, make_dispatch_double  # noqa: E402

REAL_SUBPROCESS_RUN = subprocess.run
ADMIN_PW = "rvl-test-admin-pw-2026-1116x"


class ArchReviewLegTests(unittest.TestCase):
    def setUp(self):
        """零 mock 边界全局守卫（事故整改 2026-11-17：首轮/二轮 test_13 夹具 BUG
        （BLOCKED 事件字段 422）使 resume 走完整派单链漏出真实 gpt_dispatch 两次——
        此后任何未装替身路径的真实派单调用一律当场失败，不再依赖逐用例自觉）。"""
        def guard(cmd, **kw):
            if "gpt_dispatch.mjs" in " ".join(map(str, cmd)):
                raise AssertionError("zero-mock boundary: real gpt_dispatch call leaked into test "
                                     "(install dispatch double or fix the test path)")
            return REAL_SUBPROCESS_RUN(cmd, **kw)
        self._real_run_before_guard = ar.subprocess.run
        ar.subprocess.run = guard

    def tearDown(self):
        ar.subprocess.run = self._real_run_before_guard
    @classmethod
    def setUpClass(cls):
        cls.tmp = Path(tempfile.mkdtemp(prefix="arl-test-"))
        cls.server = M1TestServer(cls.tmp / "m1")
        # 测试隔离：管理口令按本文件（server env 用自身默认，login 用此对照）
        cls.server.env["AIEO_PLATFORM_ADMIN_PASSWORD"] = ADMIN_PW
        cls.server.start()
        cls.owner = M1Client(cls.server.base)
        cls.owner.login("OWNER", ADMIN_PW)
        cls.tokens = {}
        for aid, atype, role, issue in (
            ("GPT-02", "reviewer", "arch-review-session", False),
            ("ENGINE-02", "system", "arch-review-leg-engine", True),
        ):
            code, resp = cls.owner.post("/api/v1/agents", {"agent_id": aid, "agent_type": atype,
                                                           "role": role, "issue_service_token": issue})
            if code not in (200, 201, 409):
                raise AssertionError(f"agent {aid} create failed HTTP {code}: {resp}")
            if issue and isinstance(resp, dict) and resp.get("service_token"):
                cls.tokens[aid] = resp["service_token"]
        if "ENGINE-02" not in cls.tokens:
            raise AssertionError("ENGINE-02 service token not issued on fresh test DB")
        # 测试隔离：重定向 arch_review_leg 模块级目录常量与 REPO_ROOT（材料 manifest git 基准）
        cls.orig_runtime = ar.RUNTIME_DIR
        cls.orig_dispatch_logs = ar.DISPATCH_LOG_DIR
        cls.orig_repo_root = ar.REPO_ROOT
        ar.RUNTIME_DIR = cls.tmp / "runtime"
        ar.DISPATCH_LOG_DIR = cls.tmp / "dispatch-logs"
        # 项目/批次
        code, resp = cls.owner.post("/api/v1/projects", {
            "project_id": "PRJ-ARLTEST", "name": "arch-review-leg tests",
            "description": "b-20261116-gpt02-arch-review-leg S3 test project"})
        assert code in (200, 201, 409), resp
        code, resp = cls.owner.post("/api/v1/batches", {
            "project_id": "PRJ-ARLTEST", "requirement": "arch-review-leg test batch",
            "engineering_standard_version": "1.0.0", "knowledge_base_commit": "0" * 40})
        assert code in (200, 201), resp
        cls.batch_id = resp.get("batch_id") or resp.get("id")
        # 材料夹具仓库（material manifest 的 git 基准=REPO_ROOT 重定向到此）
        cls.fixture = cls.tmp / "material-repo"
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
        (cls.fixture / "task-brief.md").write_text("# 夹具任务书\n目标：测试架构审核腿\n", encoding="utf-8")
        git("add", ".")
        git("commit", "-m", "material base")
        cls.base_commit = git("rev-parse", "HEAD").strip()
        ar.REPO_ROOT = cls.fixture   # material_manifest_sha256 的 git -C 基准

    @classmethod
    def tearDownClass(cls):
        cls.server.stop()
        ar.RUNTIME_DIR = cls.orig_runtime
        ar.DISPATCH_LOG_DIR = cls.orig_dispatch_logs
        ar.REPO_ROOT = cls.orig_repo_root
        with contextlib.suppress(Exception):
            import shutil
            shutil.rmtree(cls.tmp, ignore_errors=True)

    # ------------------------------------------------------------------
    # 夹具：每测试独立 ARCH_REVIEW 态任务（PLAN→ARCH_REVIEW 停）
    # ------------------------------------------------------------------
    def make_leg(self, tag: str, reply: str | None = None, fail_first: bool = False,
                 material_missing_from_commit: bool = False):
        """建任务→PLAN→ARCH_REVIEW（停）→返回 (leg, task_id, ctx|None)。"""
        self._leg_seq = getattr(self.__class__, "_leg_seq", 0) + 1
        self.__class__._leg_seq = self._leg_seq
        run_key = f"912{self._leg_seq:03d}"
        mat = self.fixture / f"design-{tag}.md"
        mat.write_text(f"# 设计 {tag}\n架构：模块化最小版\n", encoding="utf-8")
        self.git("add", ".")
        self.git("commit", "-m", f"material {tag}")
        commit = self.git("rev-parse", "HEAD").strip()
        if material_missing_from_commit:
            # 材料不在锚定 commit：再提交一个不含该文件的版本，用新 HEAD 作锚（fail-closed 场景）
            (self.fixture / f"design-{tag}.md").unlink()
            self.git("add", "-A")
            self.git("commit", "-m", f"remove {tag}")
            anchor = self.git("rev-parse", "HEAD").strip()
        else:
            anchor = commit

        code, resp = self.owner.post("/api/v1/tasks", {
            "batch_id": self.batch_id, "title": f"arl test task {tag}",
            "description": "arch review leg test task", "priority": "P1",
            "files_scope": [f"design-{tag}.md"],
            "acceptance_criteria": [f"design-{tag}.md defines minimal architecture"],
            "engineering_standard_version": "1.0.0",
            "knowledge_base_commit": self.base_commit, "dependencies": []})
        self.assertEqual(code, 201, f"task create: {resp}")
        task_id = resp.get("task_id") or resp.get("id")
        for event, tail in (("PLAN", "01"), ("ARCH_REVIEW", "02")):
            code, resp = self.owner.post(f"/api/v1/tasks/{task_id}/events",
                                         {"event": event, "event_id": f"EVT-FIX-{tag}-{tail}"})
            self.assertIn(code, (200, 201), f"fixture event {event}: {resp}")
        leg = ar.ArchReviewLeg(run_key=run_key, task_id=task_id, project_id="PRJ-ARLTEST",
                               input_material_commit=anchor,
                               material_files=[f"design-{tag}.md"],
                               m1_url=self.server.base, token=self.tokens["ENGINE-02"],
                               marker_text=f"[GPT02-R1|{tag}]",
                               material_base_commit=self.base_commit)
        ctx = None
        if reply is not None:
            wrapper, calls = make_dispatch_double(reply, ar.DISPATCH_LOG_DIR, fail_first=fail_first)
            ctx = (wrapper, calls)
        return leg, task_id, ctx

    @contextlib.contextmanager
    def dispatch_double(self, wrapper):
        real_run = ar.subprocess.run
        ar.subprocess.run = wrapper
        try:
            yield
        finally:
            ar.subprocess.run = real_run

    @staticmethod
    def reply_for(result: str = "PASS", extra: str = "") -> str:
        body = json.dumps({"result": result,
                           "summary": {"PASS": "架构最小闭环成立", "REWORK": "依赖边界缺失须返工",
                                       "BLOCKED": "外部系统契约未定，架构阻塞须人工决策"}[result],
                           "findings": [] if result == "PASS" else ["依赖边界未定义"],
                           "required_boundaries": ["M1-M4 零修改"],
                           "failure_paths": [] if result == "PASS" else ["M1 不可达时的派单路径"],
                           "remaining_findings": [], "unblocked": result != "BLOCKED"},
                          ensure_ascii=False)
        return f"ChatGPT 说：\n```json\n{body}\n```{extra}"

    # ------------------------------------------------------------------
    # 白名单与幂等标识
    # ------------------------------------------------------------------
    def test_01_engine02_whitelist_guards(self):
        client = ar.EngineM1Client("http://127.0.0.1:1", "tok",
                                   whitelist=ar.GPT02_WHITELIST,
                                   event_whitelist=ar.GPT02_EVENT_WHITELIST,
                                   event_forbidden=ar.GPT02_EVENT_FORBIDDEN)
        for m, p in (("GET", "/api/v1/tasks/T-P1-001"),
                     ("GET", "/api/v1/tasks/T-P1-001/dependencies"),
                     ("GET", "/api/v1/artifacts/ART-1"),
                     ("POST", "/api/v1/tasks/T-P1-001/events"),
                     ("POST", "/api/v1/artifacts"),
                     ("POST", "/api/v1/messages")):
            client.check_whitelisted(m, p)  # 不抛即过（A-1 表 6 实用端点）
        for m, p in (("POST", "/api/v1/reports/review"),   # CODE_REVIEW 专属，A-1 明确不使用
                     ("GET", "/api/v1/board"),             # GPT-03 腿用，GPT-02 白名单外
                     ("POST", "/api/v1/agents"),           # bootstrap 一次性，运行期禁
                     ("POST", "/api/v1/approvals"),
                     ("DELETE", "/api/v1/artifacts/x")):
            with self.assertRaises(OrchestrationError) as cm:
                client.check_whitelisted(m, p)
            self.assertIn("whitelist", str(cm.exception))
        for ev in ("PASS", "REWORK"):
            client.check_event(ev)
        for ev in ("BLOCKED", "CANCEL", "GIT_VALIDATE", "ARCH_REVIEW", "DEVELOPMENT_COMPLETED"):
            with self.assertRaises(OrchestrationError) as cm:
                client.check_event(ev)
            self.assertIn("forbidden", str(cm.exception))
        # 默认参数路径=GPT-03 附录 B 行为不变（/board 允许、reports/review 允许）
        d = rl.EngineM1Client("http://127.0.0.1:1", "tok")
        d.check_whitelisted("GET", "/api/v1/board")
        d.check_whitelisted("POST", "/api/v1/reports/review")
        d.check_event("GIT_VALIDATE")
        with self.assertRaises(OrchestrationError):
            d.check_whitelisted("POST", "/api/v1/nonexistent")

    def test_02_idempotent_ids_deterministic(self):
        a = ar.ArchReviewLeg(run_key="912901", task_id="T-P1-001", project_id="PRJ-ARLTEST",
                             input_material_commit="a" * 40, material_files=["x.md"],
                             m1_url="http://127.0.0.1:1", token="t",
                             material_base_commit="b" * 40)
        b = ar.ArchReviewLeg(run_key="912901", task_id="T-P1-001", project_id="PRJ-ARLTEST",
                             input_material_commit="a" * 40, material_files=["x.md"],
                             m1_url="http://127.0.0.1:1", token="t",
                             material_base_commit="b" * 40)
        self.assertEqual(a.idem_keys, b.idem_keys)
        self.assertEqual(a.message_id(), b.message_id())
        self.assertEqual(a.idem_keys["idempotency_key"], "912901-arch-review-round-1")
        self.assertRegex(a.message_id(), r"^MSG-\d{8}-\d{6}$")
        self.assertEqual(a.event_id("PASS", "01"), "EVT-ARL-912901-PASS-01")

    # ------------------------------------------------------------------
    # 材料锚定（charter A-2：固定 commit 禁隐式读最新 main）
    # ------------------------------------------------------------------
    def test_03_manifest_anchor_and_missing_fail_closed(self):
        leg, task_id, _ = self.make_leg("m1")
        sha1 = leg.material_manifest_sha256()
        self.assertEqual(sha1, leg.material_manifest_sha256())   # 确定性
        self.assertRegex(sha1, r"^[0-9a-f]{64}$")
        leg2, _, _ = self.make_leg("m2", material_missing_from_commit=True)
        with self.assertRaises(OrchestrationError) as cm:
            leg2.material_manifest_sha256()
        self.assertIn("fail-closed", str(cm.exception))

    # ------------------------------------------------------------------
    # A1 正常审核轮：ARCH_REVIEW→PASS→READY（真实 M1 全流程）
    # ------------------------------------------------------------------
    def test_04_full_flow_pass_ready(self):
        leg, task_id, ctx = self.make_leg("a1", reply=self.reply_for("PASS"))
        with self.dispatch_double(ctx[0]):
            rc = leg.run()
        self.assertEqual(rc, 0)
        code, task = self.owner.get(f"/api/v1/tasks/{task_id}")
        self.assertEqual(task.get("status"), "READY")
        # 路线 B 三件证据在档
        flags = leg.ledger.state_flags()
        self.assertIsNotNone(flags.get("A4_ARTIFACT_REPLY"))
        self.assertIsNotNone(flags.get("A4_ARTIFACT_REPORT"))
        self.assertIsNotNone(flags.get("A4_MESSAGE"))
        self.assertIsNotNone(flags.get("A5_EVENT_ADVANCED"))
        # message 类型与批次级契约（task_id=null）
        code, msg = self.owner.get(f"/api/v1/messages/{flags['A4_MESSAGE']['message_id']}")
        self.assertIn(code, (200,), f"message read-back: {msg}")
        self.assertEqual(msg.get("message_type"), "ARCH_REVIEW_SUBMITTED")
        # 白名单外端点未触碰（无 /reports/review 证据可查=M1 无 review report 记录产生）
        self.assertIsNone(flags.get("A4_REPORT"))

    # ------------------------------------------------------------------
    # A2 返工：REWORK→REWORK 态，停等人工不自动重审
    # ------------------------------------------------------------------
    def test_05_rework_stops_without_reopen(self):
        leg, task_id, ctx = self.make_leg("a2", reply=self.reply_for("REWORK"))
        with self.dispatch_double(ctx[0]):
            rc = leg.run()
        self.assertEqual(rc, 0)
        code, task = self.owner.get(f"/api/v1/tasks/{task_id}")
        self.assertEqual(task.get("status"), "REWORK")
        flags = leg.ledger.state_flags()
        self.assertEqual(flags["A5_EVENT_ADVANCED"]["event"], "REWORK")
        # 一期边界：账本无第二轮派单意图
        self.assertIsNone(flags.get("A2_REDISPATCH_INTENT"))

    # ------------------------------------------------------------------
    # A7 BLOCKED 结论：仅登记报告（artifacts+message），无事件、M1 保持 ARCH_REVIEW
    # ------------------------------------------------------------------
    def test_05b_blocked_verdict_register_only(self):
        leg, task_id, ctx = self.make_leg("a2b", reply=self.reply_for("BLOCKED"))
        with self.dispatch_double(ctx[0]):
            rc = leg.run()
        self.assertEqual(rc, 0)
        code, task = self.owner.get(f"/api/v1/tasks/{task_id}")
        self.assertEqual(task.get("status"), "ARCH_REVIEW")   # 不代提交任务级 BLOCKED
        flags = leg.ledger.state_flags()
        self.assertIsNotNone(flags.get("A4_MESSAGE"))
        self.assertIsNotNone(flags.get("A5_BLOCKED_REGISTERED_ONLY"))
        self.assertIsNone(flags.get("A5_EVENT_ADVANCED"))
        self.assertIsNone(flags.get("A5_EVENT_PASS"))
        rep = json.loads(leg.report_file.read_text(encoding="utf-8"))
        self.assertEqual(rep["result"], "ARCH_REVIEW_BLOCKED_REGISTERED")

    # ------------------------------------------------------------------
    # 契约校验失败：保留原始 artifact 不登记（fail-closed）
    # ------------------------------------------------------------------
    def test_06_contract_fail_keeps_raw_no_registration(self):
        bad = ("ChatGPT 说：\n```json\n"
               + json.dumps({"result": "PENDING", "summary": "非法结论域"}) + "\n```")
        leg, task_id, ctx = self.make_leg("a3", reply=bad)
        with self.dispatch_double(ctx[0]):
            rc = leg.run()
        self.assertEqual(rc, 2)
        code, task = self.owner.get(f"/api/v1/tasks/{task_id}")
        self.assertEqual(task.get("status"), "ARCH_REVIEW")
        flags = leg.ledger.state_flags()
        self.assertIsNotNone(flags.get("A3_REPLY_CAPTURED"))
        self.assertIsNone(flags.get("A4_MESSAGE"))
        self.assertTrue((leg.run_dir / "reply.txt").is_file())

    # ------------------------------------------------------------------
    # 简报 1200B 硬限：超限失败不截断
    # ------------------------------------------------------------------
    def test_07_brief_over_limit_fails_no_truncation(self):
        leg, task_id, _ = self.make_leg("a4")
        # 长文件名清单使 files 行膨胀超 1200B（size 检查先于 manifest，fail-fast 不截断）
        leg.material_files = [f"{'p' * 200}-{i}.md" for i in range(6)]
        code, resp = self.owner.get(f"/api/v1/tasks/{task_id}")
        with self.assertRaises(OrchestrationError) as cm:
            leg.a1_compose_brief(resp, [])
        self.assertIn("hard limit", str(cm.exception))
        self.assertIn("no truncation", str(cm.exception))

    # ------------------------------------------------------------------
    # A4 幂等重放：同请求重放无重复登记
    # ------------------------------------------------------------------
    def test_08_replay_same_request_no_duplicates(self):
        leg, task_id, ctx = self.make_leg("a5", reply=self.reply_for("PASS"))
        with self.dispatch_double(ctx[0]):
            self.assertEqual(leg.run(), 0)
        # 重放：新 leg 实例同 run_key（账本已终结状态→resume 行7 DONE 路径）
        leg2 = ar.ArchReviewLeg(run_key=leg.run_key, task_id=task_id, project_id="PRJ-ARLTEST",
                                input_material_commit=leg.input_material_commit,
                                material_files=leg.material_files,
                                m1_url=self.server.base, token=self.tokens["ENGINE-02"],
                                material_base_commit=self.base_commit)
        rc = leg2.resume()
        self.assertEqual(rc, 0)
        code, task = self.owner.get(f"/api/v1/tasks/{task_id}")
        self.assertEqual(task.get("status"), "READY")
        conn = sqlite3.connect(f"file:{self.server.db_path}?mode=ro", uri=True)
        try:
            n = conn.execute("SELECT COUNT(*) FROM messages WHERE correlation_id=?",
                             (leg.correlation_id,)).fetchone()[0]
        finally:
            conn.close()
        self.assertEqual(n, 1)

    # ------------------------------------------------------------------
    # 事件 409 幂等命中单行（A5 重放同 event_id）
    # ------------------------------------------------------------------
    def test_09_event_replay_single_row(self):
        leg, task_id, ctx = self.make_leg("a6", reply=self.reply_for("REWORK"))
        with self.dispatch_double(ctx[0]):
            self.assertEqual(leg.run(), 0)
        # 直接用原 event_id 重放同事件（M1 幂等返回）
        ev_id = leg.event_id("REWORK", "02")
        code, resp = self.owner.post(f"/api/v1/tasks/{task_id}/events",
                                     {"event": "REWORK", "event_id": ev_id,
                                      "correlation_id": leg.correlation_id})
        self.assertIn(code, (200, 201, 409), f"event replay: {resp}")
        conn = sqlite3.connect(f"file:{self.server.db_path}?mode=ro", uri=True)
        try:
            n = conn.execute("SELECT COUNT(*) FROM task_events WHERE event_id=?",
                             (ev_id,)).fetchone()[0]
        finally:
            conn.close()
        self.assertEqual(n, 1)

    # ------------------------------------------------------------------
    # §5 行1：发送失败一次换会话重派，再失败→腿级 BLOCKED
    # ------------------------------------------------------------------
    def test_10_send_failure_one_redispatch_then_blocked(self):
        leg, task_id, ctx = self.make_leg("a7", reply=self.reply_for("PASS"), fail_first=True)
        with self.dispatch_double(ctx[0]):
            rc = leg.run()
        self.assertEqual(rc, 0)   # 第二次成功（一次重派后 PASS）
        flags = leg.ledger.state_flags()
        self.assertIsNotNone(flags.get("A2_REDISPATCH_INTENT"))
        self.assertEqual(ctx[1]["n"], 2)

    def test_10b_send_failure_twice_blocked(self):
        leg, task_id, ctx = self.make_leg("a7b", reply=self.reply_for("PASS"), fail_first=True)
        # 两次都失败：替身永远失败
        always_fail = lambda cmd, **kw: (FakeProc(3, b"", b"injected send failure (test double)")
                                         if "gpt_dispatch.mjs" in " ".join(map(str, cmd))
                                         else REAL_SUBPROCESS_RUN(cmd, **kw))
        ctx = (always_fail, {"n": 0})
        with self.dispatch_double(always_fail):
            rc = leg.run()
        self.assertEqual(rc, 2)
        code, task = self.owner.get(f"/api/v1/tasks/{task_id}")
        self.assertEqual(task.get("status"), "ARCH_REVIEW")
        flags = leg.ledger.state_flags()
        self.assertIsNotNone(flags.get("A2_SEND_FAILED"))
        self.assertIsNone(flags.get("A2_SEND_CONFIRMED"))

    # ------------------------------------------------------------------
    # A3 采集 fail-closed：发送确认+采集失败→resume 原会话补采（禁重发证明）
    # ------------------------------------------------------------------
    def test_11_collect_failed_full_recovery(self):
        leg, task_id, ctx = self.make_leg("a8", reply=self.reply_for("PASS"))
        calls = ctx[1]
        real_wrapper = ctx[0]

        def collect_fail_wrapper(cmd, **kw):
            joined = " ".join(map(str, cmd))
            if "gpt_dispatch.mjs" in joined:
                calls["n"] += 1
                if calls["n"] == 1:
                    # 首发发送成功但"采集失败"：落发送证据后返回非零（exit 3 家族）
                    ddir = ar.DISPATCH_LOG_DIR / "dispatch-collect-fail-1"
                    ddir.mkdir(parents=True, exist_ok=True)
                    msg_file = None
                    for i, a in enumerate(map(str, cmd)):
                        if a == "--message-file" and i + 1 < len(cmd):
                            msg_file = Path(str(cmd[i + 1]))
                    if msg_file and msg_file.is_file():
                        (ddir / "request.txt").write_bytes(msg_file.read_bytes())
                    (ddir / "result.json").write_text(json.dumps({
                        "user_unit_key": "fallback-turn-1:0:user",
                        "conversation_url": "https://chatgpt.com/c/11111111-2222-4333-8444-555555555555",
                    }), encoding="utf-8")
                    return FakeProc(3, b"", b"injected collection failure after send double-verify")
            return real_wrapper(cmd, **kw)

        with self.dispatch_double(collect_fail_wrapper):
            rc = leg.run()
        self.assertEqual(rc, 2)
        flags = leg.ledger.state_flags()
        self.assertIsNotNone(flags.get("A2_SEND_CONFIRMED_COLLECT_FAILED"))
        # resume：补采（替身路径 reply.txt 已在账本 OUT_DIR？补采驱动=真实 node 调用会失败——
        # 测试替身：resume 的补采走 recoll 驱动 subprocess（非 gpt_dispatch），无法替身——
        # 改为模拟"人工取得回复后 attach"路径验证登记完成，另以账本断言禁重发）
        self.assertEqual(calls["n"], 1)   # 禁重发：gpt_dispatch 仅调用一次
        # 人工接管=人工补采归档（完整现场含归属快照证据）后 attach（同一 reply 同一幂等键）
        forensics = ar.DISPATCH_LOG_DIR / "manual-forensics-a8"
        forensics.mkdir(parents=True, exist_ok=True)
        reply_file = forensics / "reply.txt"
        reply_file.write_text(self.reply_for("PASS"), encoding="utf-8")
        (forensics / "result.json").write_text(json.dumps({
            "user_unit_key": "fallback-turn-1:0:user",
            "unit_count": 2,
            "conversation_url": "https://chatgpt.com/c/11111111-2222-4333-8444-555555555555",
            "completion_checks": {"final_stop_button_not_visible": True},
        }), encoding="utf-8")
        rc2 = leg.attach_reply(reply_file)
        self.assertEqual(rc2, 0)
        code, task = self.owner.get(f"/api/v1/tasks/{task_id}")
        self.assertEqual(task.get("status"), "READY")

    # ------------------------------------------------------------------
    # A5 路线 B 专属行：报告已登记但状态仍 ARCH_REVIEW→resume 按原 event_id 续推
    # ------------------------------------------------------------------
    def test_12_resume_registered_readvance(self):
        leg, task_id, ctx = self.make_leg("a9", reply=self.reply_for("PASS"))
        with self.dispatch_double(ctx[0]):
            # 手动走 A0-A4，跳过 A5（模拟"登记后进程死亡"）
            task, pending = leg.a0_precheck()
            leg.a1_compose_brief(task, pending)
            dispatch_dir = leg.a2_dispatch(leg.run_dir.joinpath("brief.txt").read_text(encoding="utf-8"))
            captured = leg.a3_capture_and_validate(dispatch_dir)
            leg.a4_register(leg._refetch_task(), captured)
            self.assertIsNone(leg.ledger.state_flags().get("A5_EVENT_ADVANCED"))
        leg2 = ar.ArchReviewLeg(run_key=leg.run_key, task_id=task_id, project_id="PRJ-ARLTEST",
                                input_material_commit=leg.input_material_commit,
                                material_files=leg.material_files,
                                m1_url=self.server.base, token=self.tokens["ENGINE-02"],
                                material_base_commit=self.base_commit)
        rc = leg2.resume()
        self.assertEqual(rc, 0)
        code, task = self.owner.get(f"/api/v1/tasks/{task_id}")
        self.assertEqual(task.get("status"), "READY")
        self.assertIsNotNone(leg2.ledger.state_flags().get("RESUME_ROUTE_B_READVANCE"))

    # ------------------------------------------------------------------
    # A-3 终态行：READY/REWORK/BLOCKED resume 语义
    # ------------------------------------------------------------------
    def test_13_resume_terminal_rows(self):
        # READY（行7）
        leg, task_id, ctx = self.make_leg("a10", reply=self.reply_for("PASS"))
        with self.dispatch_double(ctx[0]):
            self.assertEqual(leg.run(), 0)
        leg2 = ar.ArchReviewLeg(run_key=leg.run_key, task_id=task_id, project_id="PRJ-ARLTEST",
                                input_material_commit=leg.input_material_commit,
                                material_files=leg.material_files,
                                m1_url=self.server.base, token=self.tokens["ENGINE-02"],
                                material_base_commit=self.base_commit)
        rc = leg2.resume()
        self.assertEqual(rc, 0)
        self.assertIsNotNone(leg2.ledger.state_flags().get("RESUME_DONE"))   # A-3 行7 终态语义
        # BLOCKED（行9）：owner 提交任务级 BLOCKED（M1 契约：reason/owner 必填）→resume 拒绝触碰
        leg3, task3, _ = self.make_leg("a11")
        code, resp = self.owner.post(f"/api/v1/tasks/{task3}/events",
                                     {"event": "BLOCKED", "event_id": "EVT-FIX-a11-BLK",
                                      "blocked_reason": "owner manual block (fixture)",
                                      "blocked_owner": "OWNER",
                                      "unblock_condition": "test fixture condition"})
        self.assertIn(code, (200, 201), f"fixture BLOCKED event: {resp}")
        rc3 = leg3.resume()
        self.assertEqual(rc3, 2)
        code, task = self.owner.get(f"/api/v1/tasks/{task3}")
        self.assertEqual(task.get("status"), "BLOCKED")

    # ------------------------------------------------------------------
    # A6 人工退路：无锚点 attach（显式 not_applicable）→同契约同幂等键登记
    # ------------------------------------------------------------------
    def test_14_attach_reply_manual_no_anchor(self):
        leg, task_id, _ = self.make_leg("a12")   # 无替身：本腿未发送
        reply_file = self.tmp / "manual-a12.txt"
        reply_file.write_text(self.reply_for("REWORK"), encoding="utf-8")
        rc = leg.attach_reply(reply_file)
        self.assertEqual(rc, 0)
        code, task = self.owner.get(f"/api/v1/tasks/{task_id}")
        self.assertEqual(task.get("status"), "REWORK")
        flags = leg.ledger.state_flags()
        rec = flags.get("A3_REPLY_CAPTURED")
        self.assertIn("not_applicable_no_leg_send_anchor", json.dumps(rec.get("user_unit_counts") or {}))

    def test_14b_attach_blocked_register_only(self):
        leg, task_id, _ = self.make_leg("a12b")
        reply_file = self.tmp / "manual-a12b.txt"
        reply_file.write_text(self.reply_for("BLOCKED"), encoding="utf-8")
        rc = leg.attach_reply(reply_file)
        self.assertEqual(rc, 0)
        code, task = self.owner.get(f"/api/v1/tasks/{task_id}")
        self.assertEqual(task.get("status"), "ARCH_REVIEW")
        self.assertIsNone(leg.ledger.state_flags().get("A5_EVENT_ADVANCED"))

    def test_14c_attach_requires_arch_review(self):
        leg, task_id, ctx = self.make_leg("a12c", reply=self.reply_for("PASS"))
        with self.dispatch_double(ctx[0]):
            self.assertEqual(leg.run(), 0)   # 任务已 READY
        reply_file = self.tmp / "manual-a12c.txt"
        reply_file.write_text(self.reply_for("PASS"), encoding="utf-8")
        rc = leg.attach_reply(reply_file)
        self.assertEqual(rc, 2)
        self.assertIn("requires ARCH_REVIEW", (leg.run_dir / "arch-review-leg-report.json").read_text(encoding="utf-8"))

    # ------------------------------------------------------------------
    # 发送锚点缺失 fail-closed（S2-R2 NEW-P1-01 同族：INTENT-only/确认缺键）
    # ------------------------------------------------------------------
    def test_15_intent_only_attach_fails_closed(self):
        leg, task_id, _ = self.make_leg("a13")
        leg.ledger.append({"kind": "A2_SEND_INTENT_RECORDED", "attempt": 1,
                           "outcome": "INTENT"})   # 仅 INTENT（发送状态不确定）
        reply_file = self.tmp / "manual-a13.txt"
        reply_file.write_text(self.reply_for("PASS"), encoding="utf-8")
        rc = leg.attach_reply(reply_file)
        self.assertEqual(rc, 2)
        code, task = self.owner.get(f"/api/v1/tasks/{task_id}")
        self.assertEqual(task.get("status"), "ARCH_REVIEW")

    def test_15b_confirmed_send_missing_key_fails_closed_even_attach(self):
        leg, task_id, _ = self.make_leg("a14")
        leg.ledger.append({"kind": "A2_SEND_CONFIRMED", "attempt": 1,
                           "dispatch_dir": "dispatch-x", "conversation_uuid": None,
                           "sent_user_unit_key": None, "outcome": "CONFIRMED"})
        reply_file = self.tmp / "manual-a14.txt"
        reply_file.write_text(self.reply_for("PASS"), encoding="utf-8")
        rc = leg.attach_reply(reply_file)
        self.assertEqual(rc, 2)
        self.assertIn("sent_user_unit_key missing", leg.ledger.state_flags().get(
            "LEG_LEVEL_BLOCKED", {}).get("reason", ""))

    # ------------------------------------------------------------------
    # 问题14 整改证明用例（GPT-02 真实审核 REWORK 四条 P1）
    # ------------------------------------------------------------------
    def test_17_ownership_mismatch_fail_closed(self):
        """P1-01：located_key 与 sent_key 不一致必须 fail-closed（不再只记录）。"""
        leg, task_id, _ = self.make_leg("p101")
        leg.ledger.append({"kind": "A2_SEND_CONFIRMED", "attempt": 1,
                           "dispatch_dir": "dispatch-x",
                           "conversation_uuid": "https://chatgpt.com/c/11111111-2222-4333-8444-555555555555",
                           "sent_user_unit_key": "fallback-turn-9:0:user",   # ≠现场快照键
                           "outcome": "CONFIRMED"})
        forensics = ar.DISPATCH_LOG_DIR / "manual-p101"
        forensics.mkdir(parents=True, exist_ok=True)
        (forensics / "reply.txt").write_text(self.reply_for("PASS"), encoding="utf-8")
        (forensics / "result.json").write_text(json.dumps({
            "user_unit_key": "fallback-turn-1:0:user",   # located ≠ sent
            "conversation_url": "https://chatgpt.com/c/11111111-2222-4333-8444-555555555555",
        }), encoding="utf-8")
        rc = leg.attach_reply(forensics / "reply.txt")
        self.assertEqual(rc, 2)
        reason = leg.ledger.state_flags().get("LEG_LEVEL_BLOCKED", {}).get("reason", "")
        self.assertIn("ownership mismatch", reason)
        code, task = self.owner.get(f"/api/v1/tasks/{task_id}")
        self.assertEqual(task.get("status"), "ARCH_REVIEW")

    def test_17b_ownership_empty_and_missing_key_fail_closed(self):
        """G02-R1 P1-1：发送锚点存在时 located_key 空串/None/缺失一律 fail-closed
        （真值判断绕过封堵；空串不得因"为假跳过比较"通过登记）。"""
        for label, snap in (
            ("empty-string", {"user_unit_key": "",   # 空串绕过形态（G02-R1 P1-1）
                              "conversation_url": "https://chatgpt.com/c/11111111-2222-4333-8444-555555555555"}),
            ("null-key", {"user_unit_key": None,
                          "conversation_url": "https://chatgpt.com/c/11111111-2222-4333-8444-555555555555"}),
            ("missing-field", {"conversation_url": "https://chatgpt.com/c/11111111-2222-4333-8444-555555555555"}),
        ):
            leg, task_id, _ = self.make_leg(f"p101{label[:5].replace('-', '')}")
            leg.ledger.append({"kind": "A2_SEND_CONFIRMED", "attempt": 1,
                               "dispatch_dir": "dispatch-x",
                               "sent_user_unit_key": "fallback-turn-1:0:user",
                               "outcome": "CONFIRMED"})
            forensics = ar.DISPATCH_LOG_DIR / f"manual-{label}"
            forensics.mkdir(parents=True, exist_ok=True)
            (forensics / "reply.txt").write_text(self.reply_for("PASS"), encoding="utf-8")
            (forensics / "result.json").write_text(json.dumps(snap), encoding="utf-8")
            rc = leg.attach_reply(forensics / "reply.txt")
            self.assertEqual(rc, 2, f"{label}: must fail-closed")
            reason = leg.ledger.state_flags().get("LEG_LEVEL_BLOCKED", {}).get("reason", "")
            # 空串经 or 链归一为 None→"lacks"；null/missing 同路径——fail-closed 语义一致
            self.assertTrue("located user unit key invalid" in reason
                            or "lacks located user unit key" in reason,
                            f"{label}: fail-closed reason={reason!r}")
            code, task = self.owner.get(f"/api/v1/tasks/{task_id}")
            self.assertEqual(task.get("status"), "ARCH_REVIEW", label)

    def test_18_concurrent_run_key_lock(self):
        """P1-02：同 run_key 并发（第二个持锁请求）立即 fail-closed 拒绝。"""
        leg, task_id, _ = self.make_leg("p102")
        with ar.RunKeyLock(leg.run_dir, holder="p102-simulated-live-process"):
            with self.assertRaises(OrchestrationError) as cm:
                with ar.RunKeyLock(leg.run_dir, holder="p102-second"):
                    pass
            self.assertIn("held by another live process", str(cm.exception))
        # 释放后可再次取得（OS 级锁，进程退出自动释放语义）
        with ar.RunKeyLock(leg.run_dir, holder="p102-third"):
            pass

    def test_18b_cross_process_lock_competition(self):
        """G02-R1 R2 整改：真跨进程锁竞争——独立子进程 A 持锁期间，本进程取得=拒绝；
        A 进程退出（OS 释放锁）后本进程可取得（进程死自动释放语义实测）。"""
        import time as _time
        holder_script = self.tmp / "lock-holder-a.py"
        holder_script.write_text(
            "import sys, time\nfrom pathlib import Path\n"
            "sys.path.insert(0, r'" + str(REPO_ROOT / "phase1" / "tools") + "')\n"
            "import os\nos.chdir(r'" + str(REPO_ROOT / "phase1" / "tools") + "')\n"
            "import arch_review_leg as ar\n"
            "from scheduler import OrchestrationError\n"
            "run_dir = Path(r'" + str(ar.RUNTIME_DIR / "arl-p102") + "')\n"   # 与主进程重定向路径逐字一致
            "with ar.RunKeyLock(run_dir, holder='cross-process-A'):\n"
            "    print('A_HOLDING', flush=True)\n"
            "    time.sleep(3)\n"
            "print('A_RELEASED', flush=True)\n", encoding="utf-8")
        p = subprocess.Popen([sys.executable, str(holder_script)], cwd=str(REPO_ROOT),
                             stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
                             encoding="utf-8", errors="replace",
                             env={**os.environ,
                                  "AIEO_ARCH_LEG_REPO_ROOT": str(self.tmp)})   # 子进程 RUNTIME_DIR 与主进程重定向对齐
        try:
            line = p.stdout.readline().strip()   # 等 A 真正持锁（不猜时序）
            deadline = _time.time() + 15
            while line != "A_HOLDING" and _time.time() < deadline:
                line = p.stdout.readline().strip()
            self.assertEqual(line, "A_HOLDING", "holder A failed to start: " + line)
            with self.assertRaises(OrchestrationError) as cm:
                with ar.RunKeyLock(ar.RUNTIME_DIR / "arl-p102", holder="main-process-while-A-alive"):
                    pass
            self.assertIn("held by another live process", str(cm.exception))
        finally:
            p.terminate()
            try:
                p.wait(timeout=10)
            except subprocess.TimeoutExpired:
                p.kill()
        # A 死亡=OS 释放锁→本进程取得（真实跨进程语义）
        with ar.RunKeyLock(ar.RUNTIME_DIR / "arl-p102", holder="main-process-after-A-death"):
            pass

    def test_19_artifact_recovery_and_conflict_fail_closed(self):
        """P1-03：①崩溃窗口恢复——M1 已建 artifact 账本缺记录→重登记 201 duplicate 返回
        原 ID（path+SHA 内容寻址幂等），零重复记录；②真冲突（同 path 异 SHA）→409+GET
        回核无法证明一致→fail-closed 拒绝。"""
        import hashlib
        leg, task_id, _ = self.make_leg("p103")
        task, pending = leg.a0_precheck()
        leg.a1_compose_brief(task, pending)
        reply_body = ("ChatGPT 说：\n```json\n" + json.dumps(
            {"result": "PASS", "summary": "ok", "findings": [], "unblocked": True},
            ensure_ascii=False) + "\n```")
        reply_bytes = reply_body.encode("utf-8")
        reply_sha = hashlib.sha256(reply_bytes).hexdigest()
        code, art = self.owner.post("/api/v1/artifacts", {
            "task_id": task_id, "type": "REVIEW_EVIDENCE",
            "path": f"runtime/arch-review-leg/arl-{leg.run_key}/reply.txt",
            "sha256": reply_sha})
        self.assertIn(code, (200, 201, 202))
        orig_id = art.get("artifact_id") or art.get("id")
        forensics = ar.DISPATCH_LOG_DIR / "manual-p103"
        forensics.mkdir(parents=True, exist_ok=True)
        (forensics / "reply.txt").write_bytes(reply_bytes)
        (forensics / "result.json").write_text(json.dumps({
            "user_unit_key": "fallback-turn-1:0:user",
            "conversation_url": "https://chatgpt.com/c/11111111-2222-4333-8444-555555555555"}), encoding="utf-8")
        leg.ledger.append({"kind": "A2_SEND_CONFIRMED", "attempt": 1, "dispatch_dir": "manual-p103",
                           "sent_user_unit_key": "fallback-turn-1:0:user", "outcome": "CONFIRMED"})
        captured = leg.a3_capture_and_validate(forensics)
        # ①崩溃窗口恢复：账本无 artifact 记录，重登记→201 duplicate→原 ID 恢复
        out = leg.a4_register(leg._refetch_task(), captured)
        self.assertEqual(out["artifact_reply_id"], orig_id)
        conn = sqlite3.connect(f"file:{self.server.db_path}?mode=ro", uri=True)
        try:
            n = conn.execute("SELECT COUNT(*) FROM artifacts WHERE task_id=? AND path LIKE ?",
                             (task_id, f"%arl-{leg.run_key}%reply.txt")).fetchone()[0]
        finally:
            conn.close()
        self.assertEqual(n, 1)
        # ②真冲突 fail-closed：同 path 异 SHA→409→GET 回核 SHA 不匹配→拒绝
        leg2 = ar.ArchReviewLeg(run_key=leg.run_key, task_id=task_id, project_id="PRJ-ARLTEST",
                                input_material_commit=leg.input_material_commit,
                                material_files=leg.material_files,
                                m1_url=self.server.base, token=self.tokens["ENGINE-02"],
                                material_base_commit=self.base_commit)
        forged = dict(captured)
        forged["reply_sha256"] = "f" * 64   # 与已登记 artifact 冲突的伪造 SHA
        leg2.ledger.append({"kind": "A2_SEND_CONFIRMED", "attempt": 1, "dispatch_dir": "manual-p103",
                            "sent_user_unit_key": "fallback-turn-1:0:user", "outcome": "CONFIRMED"})
        with self.assertRaises(OrchestrationError) as cm:
            leg2.a4_register(leg2._refetch_task(), forged)
        self.assertIn("409", str(cm.exception))

    def test_20_event_409_terminal_verification(self):
        """P1-04：同 event_id 重放（事件已生效客户端未确认形态）→409+账本 intent 指纹
        +终态 READY 核验通过，A5_DUPLICATE_OK 登记，不误判失败不重复推进。"""
        leg, task_id, ctx = self.make_leg("p104", reply=self.reply_for("PASS"))
        with self.dispatch_double(ctx[0]):
            task, pending = leg.a0_precheck()
            leg.a1_compose_brief(task, pending)
            dispatch_dir = leg.a2_dispatch(leg.run_dir.joinpath("brief.txt").read_text(encoding="utf-8"))
            captured = leg.a3_capture_and_validate(dispatch_dir)
            leg.a4_register(leg._refetch_task(), captured)
            status = leg.a5_advance("PASS")   # 首次提交：intent 落账本→201→READY
            self.assertEqual(status, "READY")
            # 客户端未确认形态：同实例（同账本 intent）再次 a5_advance→POST 409→双证核验
            status2 = leg.a5_advance("PASS")
            self.assertEqual(status2, "READY")
        # M1 实测：同 event_id 重放返回 200 幂等响应（duplicate 标记非 409）——
        # 核心断言=不误判失败+单条记录
        conn = sqlite3.connect(f"file:{self.server.db_path}?mode=ro", uri=True)
        try:
            n = conn.execute("SELECT COUNT(*) FROM task_events WHERE event_id=?",
                             (leg.event_id("PASS", "01"),)).fetchone()[0]
        finally:
            conn.close()
        self.assertEqual(n, 1)

    def test_20b_event_409_branch_dual_evidence(self):
        """G02-R1 R2 整改：真实进入事件 409 分支——注入 POST 409（响应指认 event_id），
        账本 intent 指纹匹配→A5_DUPLICATE_OK 核验通过；响应不指认→fail-closed。"""
        leg, task_id, ctx = self.make_leg("p104b", reply=self.reply_for("REWORK"))
        with self.dispatch_double(ctx[0]):
            task, pending = leg.a0_precheck()
            leg.a1_compose_brief(task, pending)
            dispatch_dir = leg.a2_dispatch(leg.run_dir.joinpath("brief.txt").read_text(encoding="utf-8"))
            captured = leg.a3_capture_and_validate(dispatch_dir)
            leg.a4_register(leg._refetch_task(), captured)
            real_post = leg.engine.post
            ev_id = leg.event_id("REWORK", "02")
            # 0)真提交：事件生效（intent 落账本，任务进 REWORK）——409 分支语义="已生效
            #   但响应异常"，终态须已达 expected
            self.assertEqual(leg.a5_advance("REWORK"), "REWORK")
            # ①409+响应指认 event_id（同 event_id 重放且账本 intent 匹配）→核验通过
            leg.engine.post = lambda path, body: (409, {"details": {"event_id": ev_id}})
            status = leg.a5_advance("REWORK")
            self.assertEqual(status, "REWORK")
            self.assertIsNotNone(leg.ledger.state_flags().get("A5_DUPLICATE_OK"))
            # ②409+响应不指认+M1 终态不符（PASS 意图 vs REWORK 现状）→fail-closed
            #（terminal_ok 证据仅在 M1 状态已达意图目标态时成立；不符即拒绝）
            leg2 = ar.ArchReviewLeg(run_key=leg.run_key, task_id=task_id, project_id="PRJ-ARLTEST",
                                    input_material_commit=leg.input_material_commit,
                                    material_files=leg.material_files,
                                    m1_url=self.server.base, token=self.tokens["ENGINE-02"],
                                    material_base_commit=self.base_commit)
            leg2.engine.post = lambda path, body: (409, {"details": {"code": "SYS-0001",
                                                                     "message": "generic error"}})
            with self.assertRaises(OrchestrationError) as cm:
                leg2.a5_advance("PASS")
            self.assertIn("409 verification failed", str(cm.exception))
            leg.engine.post = real_post

    def test_21_crash_window_recovery(self):
        """G02-R1 P1-2：A4_MESSAGE 已落账本、A4_RESULT_RECORDED 缺失（message POST 后
        崩溃窗口）→resume 从多重证据恢复结论→按原 event_id 续推；不重派不重登记。"""
        leg, task_id, ctx = self.make_leg("p105", reply=self.reply_for("REWORK"))
        with self.dispatch_double(ctx[0]):
            task, pending = leg.a0_precheck()
            leg.a1_compose_brief(task, pending)
            dispatch_dir = leg.a2_dispatch(leg.run_dir.joinpath("brief.txt").read_text(encoding="utf-8"))
            captured = leg.a3_capture_and_validate(dispatch_dir)
            leg.a4_register(leg._refetch_task(), captured)
            # 注入崩溃窗口：账本追加式末条移除（模拟"message 登记后、最后一条账本写入前"死亡）
            ledger_path = leg.run_dir / "ledger.jsonl"
            lines = ledger_path.read_text(encoding="utf-8").splitlines()
            kept = [l for l in lines if json.loads(l).get("kind") != "A4_RESULT_RECORDED"]
            assert len(kept) < len(lines), "crash injection: A4_RESULT_RECORDED row not found"
            ledger_path.write_text("\n".join(kept) + "\n", encoding="utf-8")
        self.assertIsNone(leg.ledger.state_flags().get("A4_RESULT_RECORDED"))
        leg2 = ar.ArchReviewLeg(run_key=leg.run_key, task_id=task_id, project_id="PRJ-ARLTEST",
                                input_material_commit=leg.input_material_commit,
                                material_files=leg.material_files,
                                m1_url=self.server.base, token=self.tokens["ENGINE-02"],
                                material_base_commit=self.base_commit)
        rc = leg2.resume()
        self.assertEqual(rc, 0)
        flags = leg2.ledger.state_flags()
        self.assertIsNotNone(flags.get("A4_RESULT_RECOVERED"))
        self.assertEqual(flags.get("A4_RESULT_RECOVERED", {}).get("result"), "REWORK")
        self.assertIsNotNone(flags.get("A5_EVENT_ADVANCED"))
        code, task = self.owner.get(f"/api/v1/tasks/{task_id}")
        self.assertEqual(task.get("status"), "REWORK")
        # 禁重发证明：gpt_dispatch 调用计数不变（恢复路径零外部副作用）
        self.assertEqual(ctx[1]["n"], 1)

    # ------------------------------------------------------------------
    # setup-agents 幂等（bootstrap 一次性；非运行期路径）
    # ------------------------------------------------------------------
    def test_16_setup_agents_idempotent(self):
        os.environ["AIEO_PLATFORM_ADMIN_USERNAME"] = "OWNER"
        os.environ["AIEO_PLATFORM_ADMIN_PASSWORD"] = ADMIN_PW
        orig_runtime = ar.RUNTIME_DIR
        ar.RUNTIME_DIR = self.tmp / "runtime-setup"
        ar.RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
        # 预置令牌库（setUpClass 已签发 ENGINE-02）：复用语义=409 时代理运行时令牌库（GPT-03 test_14 先例同型）
        (ar.RUNTIME_DIR / "service-tokens.json").write_text(
            json.dumps({"ENGINE-02": self.tokens["ENGINE-02"]}), encoding="utf-8")
        try:
            rc = ar.setup_agents(self.server.base)
            self.assertEqual(rc, 0)
            rc2 = ar.setup_agents(self.server.base)
            self.assertEqual(rc2, 0, "second run must reuse existing agents (409 RES-0002)")
            tok = json.loads((ar.RUNTIME_DIR / "service-tokens.json").read_text(encoding="utf-8"))
            self.assertIn("ENGINE-02", tok)
        finally:
            ar.RUNTIME_DIR = orig_runtime
            os.environ.pop("AIEO_PLATFORM_ADMIN_PASSWORD", None)

    def test_30_mtime_tolerance_deterministic(self):
        """DEC-094 #7：arch_review_leg 的 mtime 负偏容差确定性回归——回拨 1s 定位成功、
        回拨 3s 拒判（此前严格 >= 会误杀本轮目录）。"""
        leg, task_id, commit = self.make_leg("d094m")
        brief = "brief-bytes-for-ar-d094m\n"
        (leg.run_dir / "brief.txt").write_text(brief, encoding="utf-8")
        brief_bytes = (leg.run_dir / "brief.txt").read_bytes()
        base = time.time()
        ddir = ar.DISPATCH_LOG_DIR / "dispatch-ar-d094m-mtime"
        ddir.mkdir(parents=True, exist_ok=True)
        (ddir / "request.txt").write_bytes(brief_bytes)
        os.utime(ddir, (base - 1.0, base - 1.0))
        self.assertEqual(leg._find_dispatch_dir(must=True, since=base, brief_bytes=brief_bytes), ddir)
        os.utime(ddir, (base - 3.0, base - 3.0))
        with self.assertRaises(OrchestrationError) as cm:
            leg._find_dispatch_dir(must=True, since=base, brief_bytes=brief_bytes)
        self.assertIn("no dispatch evidence", str(cm.exception))


if __name__ == "__main__":
    unittest.main()
