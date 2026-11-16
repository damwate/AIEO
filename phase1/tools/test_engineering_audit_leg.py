# -*- coding: utf-8 -*-
"""GPT-05 工程总审计真实腿测试矩阵（b-20261117-gpt05-engineering-audit-leg S3）。

charter v0.9 §7 证据矩阵映射：A1 正常审计轮（ACCEPTED，M1 批次/任务状态零变化）／
A2 WITH_RISKS／A3 采集 fail-closed（禁重发+人工 attach）／A4 幂等重放（message 409
五条件 AND）／A5a/A5b 崩溃窗口／A6 人工退路／A7 BLOCKED 留证／A8 矩阵矛盾 fail-closed／
A9 结论×建议矛盾 fail-closed／A10 权限拒绝／**A10b/c/d 服务端权限回归实测**／
A11 分页数量不一致。负例：白名单越权/契约失败/简报超限/材料锚定/归属冲突/
RunKeyLock/setup 幂等。

M1 测试实例=独立临时 DB（含 security.py 权限变更——同源实读）；ChatGPT 边界唯一
替身=拦截 gpt_dispatch（make_dispatch_double 复用 review_leg 测试基建），git/Ajv
原样真实执行。
"""

from __future__ import annotations

import contextlib
import hashlib
import json
import os
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))

import engineering_audit_leg as eal  # noqa: E402
import review_leg as rl  # noqa: E402
from scheduler import M1Client, OrchestrationError  # noqa: E402
from test_review_leg import M1TestServer, FakeProc, make_dispatch_double  # noqa: E402

REAL_SUBPROCESS_RUN = subprocess.run
ADMIN_PW = "eal-test-admin-pw-2026-1117x"
BASE_COMMIT = "b" * 40   # 批次 knowledge_base_commit/材料基线（测试夹具合成值）


class EngineeringAuditLegTests(unittest.TestCase):
    def setUp(self):
        def guard(cmd, **kw):
            if "gpt_dispatch.mjs" in " ".join(map(str, cmd)):
                raise AssertionError("zero-mock boundary: real gpt_dispatch call leaked into test "
                                     "(install dispatch double or fix the test path)")
            return REAL_SUBPROCESS_RUN(cmd, **kw)
        self._real_run_before_guard = eal.subprocess.run
        eal.subprocess.run = guard

    def tearDown(self):
        eal.subprocess.run = self._real_run_before_guard

    @classmethod
    def setUpClass(cls):
        cls.tmp = Path(tempfile.mkdtemp(prefix="eal-test-"))
        cls.server = M1TestServer(cls.tmp / "m1")
        cls.server.env["AIEO_PLATFORM_ADMIN_PASSWORD"] = ADMIN_PW
        cls.server.start()
        cls.owner = M1Client(cls.server.base)
        cls.owner.login("OWNER", ADMIN_PW)
        cls.tokens = {}
        for aid, atype, role, issue in (
            ("GPT-05", "reviewer", "engineering-audit-session", False),
            ("ENGINE-04", "system", "engineering-audit-leg-engine", True),
            ("DEV-EXEC-01", "developer", "dev-executor", False),
            ("GPT-03", "reviewer", "code-review-session", False),
        ):
            code, resp = cls.owner.post("/api/v1/agents", {"agent_id": aid, "agent_type": atype,
                                                           "role": role, "issue_service_token": issue})
            if code not in (200, 201, 409):
                raise AssertionError(f"agent {aid} create failed HTTP {code}: {resp}")
            if issue and isinstance(resp, dict) and resp.get("service_token"):
                cls.tokens[aid] = resp["service_token"]
        if "ENGINE-04" not in cls.tokens:
            raise AssertionError("ENGINE-04 service token not issued on fresh test DB")
        cls.orig_runtime = eal.RUNTIME_DIR
        cls.orig_dispatch_logs = eal.DISPATCH_LOG_DIR
        cls.orig_repo_root = eal.REPO_ROOT
        eal.RUNTIME_DIR = cls.tmp / "runtime"
        eal.DISPATCH_LOG_DIR = cls.tmp / "dispatch-logs"
        # 夹具仓库（材料 manifest git 基准；REPO_ROOT 重定向）
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
        (cls.fixture / "audit-brief.md").write_text("# 夹具审计材料\n七大工程规范清单：S1-S7\n", encoding="utf-8")
        git("add", ".")
        git("commit", "-m", "material base")
        cls.base_commit = git("rev-parse", "HEAD").strip()
        eal.REPO_ROOT = cls.fixture

    @classmethod
    def tearDownClass(cls):
        cls.server.stop()
        eal.RUNTIME_DIR = cls.orig_runtime
        eal.DISPATCH_LOG_DIR = cls.orig_dispatch_logs
        eal.REPO_ROOT = cls.orig_repo_root
        with contextlib.suppress(Exception):
            import shutil
            shutil.rmtree(cls.tmp, ignore_errors=True)

    # ------------------------------------------------------------------
    # 夹具：每测试独立批次+任务全景（两任务状态 IN_PROGRESS/READY）
    # ------------------------------------------------------------------
    def make_leg(self, tag: str, reply: str | None = None, fail_first: bool = False,
                 material_missing_from_commit: bool = False,
                 matrix_result: str = "PASS", total_mismatch: bool = False,
                 requirement: str | None = None):
        self._leg_seq = getattr(self.__class__, "_leg_seq", 0) + 1
        self.__class__._leg_seq = self._leg_seq
        run_key = f"914{self._leg_seq:03d}"
        mat = self.fixture / f"audit-{tag}.md"
        mat.write_text(f"# 审计材料 {tag}\n规范适用与执行证据说明。\n", encoding="utf-8")
        self.git("add", ".")
        self.git("commit", "-m", f"material {tag}")
        commit = self.git("rev-parse", "HEAD").strip()
        if material_missing_from_commit:
            (self.fixture / f"audit-{tag}.md").unlink()
            self.git("add", "-A")
            self.git("commit", "-m", f"remove {tag}")
            anchor = self.git("rev-parse", "HEAD").strip()
        else:
            anchor = commit

        code, resp = self.owner.post("/api/v1/projects", {
            "project_id": f"PRJ-EAL-{tag.upper()}", "name": f"eal test {tag}",
            "description": "engineering audit leg test project"})
        assert code in (200, 201, 409), resp
        code, resp = self.owner.post("/api/v1/batches", {
            "project_id": f"PRJ-EAL-{tag.upper()}", "requirement": requirement or f"eal audit test batch {tag}",
            "engineering_standard_version": "1.0.0", "knowledge_base_commit": BASE_COMMIT})
        assert code in (200, 201), resp
        batch_id = resp.get("batch_id") or resp.get("id")
        # 任务全景（两任务：IN_PROGRESS + READY——C2 全景与状态计数）
        for idx in (1, 2):
            code, resp = self.owner.post("/api/v1/tasks", {
                "batch_id": batch_id, "title": f"eal task {tag}-{idx}",
                "description": "audit test task", "priority": "P1",
                "files_scope": [f"audit-{tag}.md"],
                "acceptance_criteria": [f"audit-{tag}.md criteria {idx}"],
                "engineering_standard_version": "1.0.0",
                "knowledge_base_commit": BASE_COMMIT, "dependencies": []})
            assert code == 201, f"task create: {resp}"
            task_id = resp.get("task_id") or resp.get("id")
            code, resp = self.owner.post(f"/api/v1/tasks/{task_id}/events",
                                         {"event": "PLAN", "event_id": f"EVT-{tag}-{idx}-01"})
            assert code in (200, 201), resp
            if idx == 1:
                code, resp = self.owner.post(f"/api/v1/tasks/{task_id}/events",
                                             {"event": "ARCH_REVIEW", "event_id": f"EVT-{tag}-{idx}-02"})
                assert code in (200, 201), resp
                code, resp = self.owner.post(f"/api/v1/tasks/{task_id}/events",
                                             {"event": "PASS", "event_id": f"EVT-{tag}-{idx}-03"})
                assert code in (200, 201), resp
                code, resp = self.owner.post(f"/api/v1/tasks/{task_id}/claim", {
                    "agent_id": "DEV-EXEC-01", "base_commit": self.base_commit,
                    "correlation_id": "CORR-990001"})
                assert code in (200, 201), f"claim: {resp}"
                code, resp = self.owner.post(f"/api/v1/tasks/{task_id}/events",
                                             {"event": "START", "event_id": f"EVT-{tag}-{idx}-04"})
                assert code in (200, 201), resp
        leg = eal.EngineeringAuditLeg(run_key=run_key, batch_id=batch_id,
                                      project_id=f"PRJ-EAL-{tag.upper()}",
                                      input_material_commit=anchor,
                                      material_files=[f"audit-{tag}.md"],
                                      m1_url=self.server.base, token=self.tokens["ENGINE-04"],
                                      marker_text=f"[GPT05-AUDIT-R1|{tag}]",
                                      material_base_commit=self.base_commit)
        ctx = None
        if reply is not None:
            wrapper, calls = make_dispatch_double(reply, eal.DISPATCH_LOG_DIR, fail_first=fail_first)
            ctx = (wrapper, calls)
        return leg, batch_id, ctx

    @contextlib.contextmanager
    def dispatch_double(self, wrapper):
        real_run = eal.subprocess.run
        eal.subprocess.run = wrapper
        try:
            yield
        finally:
            eal.subprocess.run = real_run

    @staticmethod
    def reply_for(result: str = "ACCEPTED", reco: str | None = None,
                  matrix_results: list[str] | None = None,
                  skip_findings_reason: bool = False) -> str:
        reco = reco or {"ACCEPTED": "SUBMIT_FOR_APPROVAL",
                        "ACCEPTED_WITH_RISKS": "CONDITIONAL_SUBMIT_WITH_RISKS",
                        "BLOCKED": "DO_NOT_SUBMIT"}[result]
        results = matrix_results if matrix_results is not None else (
            ["PASS"] if result == "ACCEPTED" else
            ["PASS", "ISSUE"] if result == "ACCEPTED_WITH_RISKS" else ["PASS", "BLOCKED"])
        matrix = []
        for i, r in enumerate(results):
            matrix.append({"standard_id": f"S{i+1}", "applicable": True,
                           "requirement": f"规范 S{i+1} 要求", "evidence_refs": ["audit-brief.md"],
                           "result": r,
                           "findings": "" if r == "PASS" else f"S{i+1} 执行证据缺口",
                           "residual_risks": "" if r == "PASS" else f"S{i+1} 遗留风险"})
        if skip_findings_reason:
            matrix.append({"standard_id": "S9", "applicable": False, "requirement": "豁免项",
                           "evidence_refs": [], "result": "PASS", "findings": "", "residual_risks": ""})
        body = json.dumps({"result": result, "release_recommendation": reco,
                           "standards_matrix": matrix,
                           "summary": {"ACCEPTED": "批次任务状态与规范执行证据齐备",
                                       "ACCEPTED_WITH_RISKS": "存在规范执行缺口须披露风险",
                                       "BLOCKED": "存在规范 BLOCKED 项，审计阻塞须人工"}[result],
                           "findings": [] if result == "ACCEPTED" else ["S2 执行证据缺口"],
                           "risks": [] if result == "ACCEPTED" else ["S2 遗留风险"]},
                          ensure_ascii=False)
        return f"ChatGPT 说：\n```json\n{body}\n```"

    # ------------------------------------------------------------------
    # 白名单（A-1 定稿 8 端点+分页正则+排除清单）与幂等标识
    # ------------------------------------------------------------------
    def test_01_engine04_whitelist_guards(self):
        client = eal.EngineM1Client("http://127.0.0.1:1", "tok",
                                    whitelist=eal.GPT05_WHITELIST,
                                    event_whitelist=eal.GPT05_EVENT_WHITELIST,
                                    event_forbidden=eal.GPT05_EVENT_FORBIDDEN)
        for m, p in (("GET", "/api/v1/batches/BATCH-001"),
                     ("GET", "/api/v1/tasks?batch_id=BATCH-001"),
                     ("GET", "/api/v1/tasks?batch_id=BATCH-001&page=2&page_size=200"),
                     ("GET", "/api/v1/tasks/T-P1-001"),
                     ("GET", "/api/v1/artifacts/ART-1"),
                     ("GET", "/api/v1/reports?type=test&task_id=T-P1-001"),
                     ("GET", "/api/v1/messages?correlation_id=CORR-914001"),
                     ("POST", "/api/v1/artifacts"),
                     ("POST", "/api/v1/messages")):
            client.check_whitelisted(m, p)  # 不抛即过（A-1 定稿 8 端点）
        for m, p in (("GET", "/api/v1/tasks"),                      # 无 batch_id：客户端模板不匹配
                     ("GET", "/api/v1/messages/M-1"),              # 服务端未授权，客户端亦不含
                     ("POST", "/api/v1/tasks/T-P1-001/events"),    # 无状态事件
                     ("POST", "/api/v1/agents"),
                     ("POST", "/api/v1/approvals"),
                     ("POST", "/api/v1/reports/test"),             # GPT-04 腿职责
                     ("GET", "/api/v1/board"),
                     ("POST", "/api/v1/batches"),
                     ("DELETE", "/api/v1/artifacts/x")):
            with self.assertRaises(OrchestrationError) as cm:
                client.check_whitelisted(m, p)
            self.assertIn("whitelist", str(cm.exception))
        for ev in ("PASS", "BLOCKED", "CANCEL", "GIT_VALIDATE"):
            with self.assertRaises(OrchestrationError):
                client.check_event(ev)
        d = rl.EngineM1Client("http://127.0.0.1:1", "tok")
        d.check_whitelisted("GET", "/api/v1/board")
        d.check_event("GIT_VALIDATE")   # 既有腿行为不变（同构锚）

    def test_02_idempotent_ids_deterministic(self):
        kw = dict(batch_id="BATCH-001", project_id="PRJ-EAL-X",
                  input_material_commit="a" * 40, material_files=["x.md"],
                  m1_url="http://127.0.0.1:1", token="t", material_base_commit=BASE_COMMIT)
        a = eal.EngineeringAuditLeg(run_key="914901", **kw)
        b = eal.EngineeringAuditLeg(run_key="914901", **kw)
        self.assertEqual(a.idem_keys, b.idem_keys)
        self.assertEqual(a.message_id(), b.message_id())
        self.assertEqual(a.idem_keys["idempotency_key"], "914901-engineering-audit-round-1")
        self.assertRegex(a.message_id(), r"^MSG-\d{8}-\d{6}$")

    # ------------------------------------------------------------------
    # A0 前置核查 + C2 全量分页 fail-closed（A11）
    # ------------------------------------------------------------------
    def test_03_precheck_and_panorama(self):
        leg, batch_id, _, = self.make_leg("t03")
        batch, panorama = leg.a0_precheck()
        self.assertEqual(len(panorama), 2)
        flags = leg.ledger.state_flags()
        self.assertEqual(flags["A0_PRECHECK"]["tasks_total"], 2)
        # 批次不存在
        leg2 = eal.EngineeringAuditLeg(run_key="914902", batch_id="BATCH-999",
                                       project_id="PRJ-EAL-T03",
                                       input_material_commit="a" * 40,
                                       material_files=["x.md"],
                                       m1_url=self.server.base, token=self.tokens["ENGINE-04"],
                                       material_base_commit=BASE_COMMIT)
        with self.assertRaises(OrchestrationError) as cm:
            leg2.a0_precheck()
        self.assertIn("GET batch", str(cm.exception))

    def test_04_pagination_total_mismatch_fail_closed(self):
        leg, batch_id, _ = self.make_leg("t04")
        real_get = leg.engine.get

        def get_total_mismatch(path, timeout=None):
            out = real_get(path, timeout=timeout)
            if "/api/v1/tasks?" in path:
                code, resp = out
                resp = dict(resp)
                resp["total"] = resp["total"] + 5   # 注入 total 不一致
                return code, resp
            return out
        leg.engine.get = get_total_mismatch
        with self.assertRaises(OrchestrationError) as cm:
            leg.a0_precheck()
        self.assertIn("pagination mismatch", str(cm.exception))

    # ------------------------------------------------------------------
    # A1 简报：绑定字段+超限+材料锚定
    # ------------------------------------------------------------------
    def test_05_brief_bound_fields(self):
        leg, batch_id, _ = self.make_leg("t05")
        batch, panorama = leg.a0_precheck()
        brief = leg.a1_compose_brief(batch, panorama)
        self.assertIn(leg.marker_text, brief)
        a1 = leg.ledger.state_flags().get("A1_BRIEF") or {}
        self.assertTrue(a1.get("brief_sha256"))
        self.assertTrue(a1.get("input_material_manifest_sha256"))
        self.assertLessEqual(len(brief.encode("utf-8")), eal.OUTBOUND_LIMIT)

    def test_06_brief_over_limit_fails_no_truncation(self):
        # 超长批次需求（简报第一段全量携带需求原文→推高字节超限）
        leg, batch_id, _ = self.make_leg("t06", requirement="超长批次需求描述" * 120)
        for i in range(3, 8):
            code, resp = self.owner.post("/api/v1/tasks", {
                "batch_id": leg.batch_id, "title": f"eal task t06-{i}",
                "description": "audit test", "priority": "P1",
                "files_scope": ["audit-t06.md"],
                "acceptance_criteria": ["criteria"],
                "engineering_standard_version": "1.0.0",
                "knowledge_base_commit": BASE_COMMIT, "dependencies": []})
            assert code == 201, resp
        batch, panorama = leg.a0_precheck()
        with self.assertRaises(OrchestrationError) as cm:
            leg.a1_compose_brief(batch, panorama)
        self.assertIn("hard limit", str(cm.exception))
        self.assertFalse((leg.run_dir / "brief.txt").exists())

    def test_07_manifest_anchor_missing_fail_closed(self):
        leg, batch_id, _ = self.make_leg("t07", material_missing_from_commit=True)
        batch, panorama = leg.a0_precheck()
        with self.assertRaises(OrchestrationError) as cm:
            leg.a1_compose_brief(batch, panorama)
        self.assertIn("not in commit", str(cm.exception))

    # ------------------------------------------------------------------
    # A1 正常审计轮（ACCEPTED；M1 批次/任务状态零变化=A5 核验）
    # ------------------------------------------------------------------
    def test_08_full_flow_accepted_no_state_change(self):
        leg, batch_id, ctx = self.make_leg("t08", reply=self.reply_for("ACCEPTED"))
        code, batch_before = self.owner.get(f"/api/v1/batches/{batch_id}")
        code, tasks_before = self.owner.get(f"/api/v1/tasks?batch_id={batch_id}")
        with self.dispatch_double(ctx[0]):
            rc = leg.run()
        self.assertEqual(rc, 0)
        self.assertEqual(leg.ledger.state_flags().get("A5_DONE", {}).get("result"), "ACCEPTED")
        # M1 状态零变化
        code, batch_after = self.owner.get(f"/api/v1/batches/{batch_id}")
        self.assertEqual(batch_after.get("status"), batch_before.get("status"))
        code, tasks_after = self.owner.get(f"/api/v1/tasks?batch_id={batch_id}")
        self.assertEqual(tasks_after.get("total"), tasks_before.get("total"))
        flags = leg.ledger.state_flags()
        self.assertIsNotNone(flags.get("A4_REGISTERED"))
        self.assertIsNotNone(flags.get("A4_MESSAGE"))
        self.assertTrue(flags["A5_DONE"]["task_statuses_unchanged"])   # G05-DR 整改3：任务快照核验
        # 三步登记读回：message correlation 读回+payload 绑定（A4c 成功路径读回核验已在 a4 内执行）
        code, msgs = self.owner.get(f"/api/v1/messages?correlation_id=CORR-{leg.run_key}")
        items = msgs.get("items") if isinstance(msgs, dict) else msgs
        self.assertTrue(any(m.get("message_id") == leg.message_id() for m in items))
        msg = next(m for m in items if m.get("message_id") == leg.message_id())
        self.assertIsNone(msg.get("task_id"))          # 批次级信封：task_id=null
        self.assertEqual(msg.get("batch_id"), batch_id)

    # ------------------------------------------------------------------
    # A2 WITH_RISKS（矩阵含 ISSUE）／A7 BLOCKED（reco=DO_NOT_SUBMIT）
    # ------------------------------------------------------------------
    def test_09_with_risks_and_blocked(self):
        leg, batch_id, ctx = self.make_leg("t09a", reply=self.reply_for("ACCEPTED_WITH_RISKS"))
        with self.dispatch_double(ctx[0]):
            rc = leg.run()
        self.assertEqual(rc, 0)
        flags = leg.ledger.state_flags()
        self.assertEqual(flags["A3_CONTRACT_VALID"]["result"], "ACCEPTED_WITH_RISKS")
        leg2, batch2, ctx2 = self.make_leg("t09b", reply=self.reply_for("BLOCKED"))
        with self.dispatch_double(ctx2[0]):
            rc2 = leg2.run()
        self.assertEqual(rc2, 0)
        self.assertEqual(leg2.ledger.state_flags()["A3_CONTRACT_VALID"]["result"], "BLOCKED")
        code, batch = self.owner.get(f"/api/v1/batches/{batch2}")
        self.assertEqual(batch.get("status"), "PLANNING")   # M1 状态不动

    # ------------------------------------------------------------------
    # A8 矩阵矛盾／A9 结论×建议矛盾／豁免无理由 fail-closed
    # ------------------------------------------------------------------
    def test_10_matrix_contradiction_fail_closed(self):
        leg, batch_id, ctx = self.make_leg("t10a", reply=self.reply_for(
            "ACCEPTED", matrix_results=["PASS", "BLOCKED"]))
        with self.dispatch_double(ctx[0]):
            rc = leg.run()
        self.assertEqual(rc, 2)
        self.assertIn("C1", (leg.ledger.state_flags().get("LEG_LEVEL_BLOCKED") or {}).get("reason", ""))

    def test_11_reco_contradiction_fail_closed(self):
        leg, batch_id, ctx = self.make_leg("t11", reply=self.reply_for(
            "BLOCKED", reco="SUBMIT_FOR_APPROVAL"))
        with self.dispatch_double(ctx[0]):
            rc = leg.run()
        self.assertEqual(rc, 2)
        self.assertIn("C3", (leg.ledger.state_flags().get("LEG_LEVEL_BLOCKED") or {}).get("reason", ""))

    def test_12_waiver_without_reason_fail_closed(self):
        leg, batch_id, ctx = self.make_leg("t12", reply=self.reply_for(
            "ACCEPTED", skip_findings_reason=True))
        with self.dispatch_double(ctx[0]):
            rc = leg.run()
        self.assertEqual(rc, 2)
        self.assertIn("适用性不等于免检", (leg.ledger.state_flags().get("LEG_LEVEL_BLOCKED") or {}).get("reason", ""))

    # ------------------------------------------------------------------
    # G05-DR 整改1回归：矩阵仅 ISSUE+总结果 BLOCKED→fail-closed（冻结映射未定义组合）
    # ------------------------------------------------------------------
    def test_24_matrix_issue_only_blocked_fail_closed(self):
        leg, batch_id, ctx = self.make_leg("t24", reply=self.reply_for(
            "BLOCKED", matrix_results=["PASS", "ISSUE"]))
        with self.dispatch_double(ctx[0]):
            rc = leg.run()
        self.assertEqual(rc, 2)
        reason = (leg.ledger.state_flags().get("LEG_LEVEL_BLOCKED") or {}).get("reason", "")
        self.assertIn("matrix ISSUE-only but total result=BLOCKED", reason)

    # ------------------------------------------------------------------
    # A3 契约校验失败：保留原始 artifact 不登记
    # ------------------------------------------------------------------
    def test_13_contract_fail_keeps_raw_no_registration(self):
        bad = json.dumps({"result": "ACCEPTED", "release_recommendation": "SUBMIT_FOR_APPROVAL",
                          "standards_matrix": [{"standard_id": "S1", "applicable": True,
                                                "requirement": "r", "evidence_refs": [],
                                                "result": "PASS", "findings": 123,
                                                "residual_risks": ""}],
                          "summary": "格式错位", "findings": [], "risks": []},
                         ensure_ascii=False)
        leg, batch_id, ctx = self.make_leg("t13", reply=f"ChatGPT 说：\n```json\n{bad}\n```")
        with self.dispatch_double(ctx[0]):
            rc = leg.run()
        self.assertEqual(rc, 2)
        self.assertTrue((leg.run_dir / "reply.txt").is_file())
        self.assertTrue((leg.run_dir / "ajv-failure.json").is_file())
        self.assertIsNone(leg.ledger.state_flags().get("A4_MESSAGE"))
        code, tasks = self.owner.get(f"/api/v1/tasks?batch_id={batch_id}")
        for t in (tasks.get("items") or []):
            code2, tk = self.owner.get(f"/api/v1/tasks/{t['task_id']}")
            self.assertEqual(tk.get("status"), t.get("status"))   # M1 状态零变化

    # ------------------------------------------------------------------
    # A4 message 409 五条件 AND：核实通过分支与 fail-closed 分支
    # ------------------------------------------------------------------
    def test_14_message_409_five_condition_verified(self):
        leg, batch_id, ctx = self.make_leg("t14", reply=self.reply_for("ACCEPTED"))
        real_post = leg.engine.post
        calls = {"n": 0}

        def post_409_after_real(path, body, timeout=None):
            out = real_post(path, body, timeout=timeout)
            if path == "/api/v1/messages":
                calls["n"] += 1
                return 409, {"code": "RES-0003", "message": "DUPLICATE (injected)",
                             "details": {"message_id": leg.message_id()}}
            return out
        leg.engine.post = post_409_after_real
        with self.dispatch_double(ctx[0]):
            rc = leg.run()
        self.assertEqual(rc, 0)   # 五条件 AND 全过（真实登记+correlation 读回+绑定一致）
        self.assertEqual(calls["n"], 1)
        self.assertIsNotNone(leg.ledger.state_flags().get("A4_DUPLICATE_OK"))

    def test_15_message_409_fail_closed_when_readback_missing(self):
        leg, batch_id, ctx = self.make_leg("t15", reply=self.reply_for("ACCEPTED"))
        real_post = leg.engine.post
        real_get = leg.engine.get

        def post_409_no_registration(path, body, timeout=None):
            if path == "/api/v1/messages":
                return 409, {"code": "RES-0003", "message": "DUPLICATE (injected)",
                             "details": {"message_id": leg.message_id()}}
            return real_post(path, body, timeout=timeout)

        def get_no_messages(path, timeout=None):
            if "correlation_id" in path:
                return 200, {"items": [], "total": 0}   # 读回为空=条件③不成立
            return real_get(path, timeout=timeout)
        leg.engine.post = post_409_no_registration
        leg.engine.get = get_no_messages
        with self.dispatch_double(ctx[0]):
            rc = leg.run()
        self.assertEqual(rc, 2)
        reason = (leg.ledger.state_flags().get("LEG_LEVEL_BLOCKED") or {}).get("reason", "")
        self.assertIn("five-condition", reason)
        code, msgs = self.owner.get(f"/api/v1/messages?correlation_id=CORR-{leg.run_key}")
        items = msgs.get("items") if isinstance(msgs, dict) else msgs
        self.assertEqual(len(items or []), 0)   # 无登记

    # ------------------------------------------------------------------
    # A5a 崩溃窗口：A4_MESSAGE 已登记而聚合标志未写→resume 读回恢复
    # ------------------------------------------------------------------
    def test_16_crash_window_recovery_via_correlation_readback(self):
        leg, batch_id, ctx = self.make_leg("t16", reply=self.reply_for("ACCEPTED"))
        real_post = leg.engine.post

        def post_die_before_register_done(path, body, timeout=None):
            out = real_post(path, body, timeout=timeout)   # message 真实登记成功
            if path == "/api/v1/messages":
                raise RuntimeError("injected crash after message POST (before aggregate flag)")
            return out
        leg.engine.post = post_die_before_register_done
        with self.dispatch_double(ctx[0]):
            with self.assertRaises(RuntimeError):
                leg.run()
        flags = leg.ledger.state_flags()
        self.assertIsNotNone(flags.get("A4_MESSAGE_INTENT"))   # POST 前意图已落账本
        self.assertIsNone(flags.get("A4_MESSAGE"))             # 崩溃在登记成功与账本写入之间
        self.assertIsNone(flags.get("A4_REGISTERED"))
        leg2 = eal.EngineeringAuditLeg(run_key=leg.run_key, batch_id=leg.batch_id,
                                       project_id=leg.project_id,
                                       input_material_commit=leg.input_material_commit,
                                       material_files=leg.material_files,
                                       m1_url=self.server.base, token=self.tokens["ENGINE-04"],
                                       material_base_commit=self.base_commit,
                                       marker_text=leg.marker_text)
        rc = leg2.resume()
        self.assertEqual(rc, 0)
        # 崩溃窗口恢复路径=message 409 五条件 AND（真实 duplicate）→DUP_OK→聚合标志补齐
        self.assertIsNotNone(leg2.ledger.state_flags().get("A4_DUPLICATE_OK"))
        self.assertIsNotNone(leg2.ledger.state_flags().get("A4_REGISTERED"))

    # ------------------------------------------------------------------
    # A10b/c/d：服务端权限回归实测（security.py 变更的真 HTTP 验证）
    # ------------------------------------------------------------------
    def test_17_service_permission_regression_abcd(self):
        leg, batch_id, _, = self.make_leg("t17")
        token = self.tokens["ENGINE-04"]

        def raw_get(path, bearer):
            req = urllib.request.Request(f"{self.server.base}{path}", method="GET",
                                         headers={"Authorization": f"Bearer {bearer}",
                                                  "Accept": "application/json"})
            try:
                with urllib.request.urlopen(req, timeout=10) as r:
                    return r.getcode(), json.loads(r.read().decode("utf-8"))
            except urllib.error.HTTPError as exc:
                return exc.code, json.loads(exc.read().decode("utf-8"))
        # A10b：服务身份无 batch_id→403
        code, resp = raw_get("/api/v1/tasks", token)
        self.assertEqual(code, 403, f"A10b: {resp}")
        # A10c：服务身份带 batch_id→200
        code, resp = raw_get(f"/api/v1/tasks?batch_id={batch_id}", token)
        self.assertEqual(code, 200, f"A10c: {resp}")
        self.assertEqual(resp.get("total"), 2)
        # A10d：OWNER 无 batch_id→200（人工会话行为零变化；OWNER 走会话客户端）
        code, resp = self.owner.get("/api/v1/tasks")
        self.assertEqual(code, 200, f"A10d owner-session: {resp}")

    # ------------------------------------------------------------------
    # 发送失败分类/采集 fail-closed/归属冲突
    # ------------------------------------------------------------------
    def test_18_send_failure_one_redispatch(self):
        leg, batch_id, ctx = self.make_leg("t18", reply=self.reply_for("ACCEPTED"),
                                           fail_first=True)
        with self.dispatch_double(ctx[0]):
            rc = leg.run()
        self.assertEqual(rc, 0)
        self.assertEqual(ctx[1]["n"], 2)

    def test_19_collect_failed_recovery_via_attach(self):
        leg, batch_id, ctx = self.make_leg("t19", reply=self.reply_for("ACCEPTED"))
        calls = ctx[1]
        real_wrapper = ctx[0]

        def collect_fail_wrapper(cmd, **kw):
            joined = " ".join(map(str, cmd))
            if "gpt_dispatch.mjs" in joined:
                calls["n"] += 1
                if calls["n"] == 1:
                    ddir = eal.DISPATCH_LOG_DIR / "dispatch-collect-fail-t19"
                    ddir.mkdir(parents=True, exist_ok=True)
                    msg_file = None
                    for i, a in enumerate(map(str, cmd)):
                        if a == "--message-file" and i + 1 < len(cmd):
                            msg_file = Path(str(cmd[i + 1]))
                    if msg_file and msg_file.is_file():
                        (ddir / "request.txt").write_bytes(msg_file.read_bytes())
                    (ddir / "result.json").write_text(json.dumps({
                        "user_unit_key": "fallback-turn-0:0:user",
                        "conversation_url": "https://chatgpt.com/c/11111111-2222-4333-8444-555555555555",
                    }), encoding="utf-8")
                    return FakeProc(3, b"", b"injected collection failure after send double-verify")
            return real_wrapper(cmd, **kw)

        with self.dispatch_double(collect_fail_wrapper):
            rc = leg.run()
        self.assertEqual(rc, 2)
        self.assertIsNotNone(leg.ledger.state_flags().get("A2_SEND_CONFIRMED_COLLECT_FAILED"))
        self.assertEqual(calls["n"], 1)   # 禁重发
        forensics = eal.DISPATCH_LOG_DIR / "manual-forensics-t19"
        forensics.mkdir(parents=True, exist_ok=True)
        reply_file = forensics / "reply.txt"
        reply_file.write_text(self.reply_for("ACCEPTED"), encoding="utf-8")
        (forensics / "result.json").write_text(json.dumps({
            "user_unit_key": "fallback-turn-0:0:user",
            "conversation_url": "https://chatgpt.com/c/11111111-2222-4333-8444-555555555555",
        }), encoding="utf-8")
        rc2 = leg.attach_reply(reply_file)
        self.assertEqual(rc2, 0)
        self.assertIsNotNone(leg.ledger.state_flags().get("A4_REGISTERED"))

    def test_20_ownership_mismatch_fail_closed(self):
        leg, batch_id, _ = self.make_leg("t20")
        leg.ledger.append({"kind": "A2_SEND_CONFIRMED", "attempt": 1,
                           "dispatch_dir": "dispatch-x",
                           "conversation_uuid": "https://chatgpt.com/c/11111111-2222-4333-8444-555555555555",
                           "sent_user_unit_key": "fallback-turn-9:0:user",
                           "outcome": "CONFIRMED"})
        forensics = eal.DISPATCH_LOG_DIR / "manual-t20"
        forensics.mkdir(parents=True, exist_ok=True)
        (forensics / "reply.txt").write_text(self.reply_for("ACCEPTED"), encoding="utf-8")
        (forensics / "result.json").write_text(json.dumps({
            "user_unit_key": "fallback-turn-1:0:user",
            "conversation_url": "https://chatgpt.com/c/11111111-2222-4333-8444-555555555555",
        }), encoding="utf-8")
        rc = leg.attach_reply(forensics / "reply.txt")
        self.assertEqual(rc, 2)
        self.assertIn("ownership mismatch",
                      (leg.ledger.state_flags().get("LEG_LEVEL_BLOCKED") or {}).get("reason", ""))

    def test_21_resume_intent_without_confirmation_fail_closed(self):
        leg, batch_id, _ = self.make_leg("t21")
        leg.ledger.append({"kind": "A2_SEND_INTENT_RECORDED", "attempt": 1, "outcome": "INTENT"})
        rc = leg.resume()
        self.assertEqual(rc, 2)
        self.assertIn("A-3", (leg.ledger.state_flags().get("LEG_LEVEL_BLOCKED") or {}).get("reason", ""))

    # ------------------------------------------------------------------
    # RunKeyLock 跨进程互斥／setup 幂等
    # ------------------------------------------------------------------
    def test_22_run_key_lock_rejects_concurrent(self):
        leg, batch_id, _ = self.make_leg("t22")
        lock = eal.RunKeyLock(leg.run_dir, holder="external-simulation")
        lock.__enter__()
        try:
            with self.assertRaises(OrchestrationError) as cm:
                leg.run()
            self.assertIn("run_key lock", str(cm.exception))
        finally:
            lock.__exit__()
        with eal.RunKeyLock(leg.run_dir, holder="after-release"):
            pass

    def test_23_setup_agents_idempotent(self):
        os.environ["AIEO_PLATFORM_ADMIN_USERNAME"] = "OWNER"
        os.environ["AIEO_PLATFORM_ADMIN_PASSWORD"] = ADMIN_PW
        orig_runtime = eal.RUNTIME_DIR
        eal.RUNTIME_DIR = self.tmp / "runtime-setup"
        eal.RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
        (eal.RUNTIME_DIR / "service-tokens.json").write_text(
            json.dumps({"ENGINE-04": self.tokens["ENGINE-04"]}), encoding="utf-8")
        try:
            rc = eal.setup_agents(self.server.base)
            self.assertEqual(rc, 0)
            rc2 = eal.setup_agents(self.server.base)
            self.assertEqual(rc2, 0, "second run must reuse existing agents (409 RES-0002)")
        finally:
            eal.RUNTIME_DIR = orig_runtime
            os.environ.pop("AIEO_PLATFORM_ADMIN_USERNAME", None)
            os.environ.pop("AIEO_PLATFORM_ADMIN_PASSWORD", None)


if __name__ == "__main__":
    unittest.main()
