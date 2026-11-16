# -*- coding: utf-8 -*-
"""GPT-04 测试验收真实腿测试矩阵（b-20261117-gpt04-test-acceptance-leg S3）。

charter v0.3 §7 验收映射：A1 正常验收轮（EXECUTED_PASS+PASS→ACCEPTED，含 ACCEPTED
证据门）／A2 REWORK（EXECUTED_FAIL+REWORK→REWORK 停等）／A3 采集 fail-closed 恢复
（禁重发证明+人工 attach）／A4 幂等重放（duplicate 409 RES-0003 非幂等返回语义）／
A5 断点恢复（A-3 定稿 12 行：崩溃窗口 GET /reports 五字段核实→行8 原键重试）／
A6 人工退路 attach-reply／A7 BLOCKED 结论仅留证。负例：白名单越权/契约校验失败/
简报超限/材料锚定/15 组合矩阵禁止组合（G2-01/02）/G2-04 复述不一致/发送状态不确定
fail-closed/RunKeyLock 跨进程。

M1 测试实例=独立临时 DB（既有 DB 零接触）；ChatGPT 边界唯一替身=拦截 gpt_dispatch
（make_dispatch_double 复用 review_leg 测试基建），git/Ajv 原样真实执行。
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
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))

import test_acceptance_leg as tal  # noqa: E402
import review_leg as rl  # noqa: E402
from scheduler import M1Client, OrchestrationError  # noqa: E402
from test_review_leg import M1TestServer, FakeProc, make_dispatch_double  # noqa: E402

REAL_SUBPROCESS_RUN = subprocess.run
ADMIN_PW = "tal-test-admin-pw-2026-1117x"
SYNTH_COMMIT = "c" * 40   # 被测测试对象 commit（F-003 报告与 --commit-sha 绑定）


class TestAcceptanceLegTests(unittest.TestCase):
    def setUp(self):
        """零 mock 边界全局守卫（GPT-02 事故整改同构：未装替身路径的真实派单调用
        一律当场失败）。"""
        def guard(cmd, **kw):
            if "gpt_dispatch.mjs" in " ".join(map(str, cmd)):
                raise AssertionError("zero-mock boundary: real gpt_dispatch call leaked into test "
                                     "(install dispatch double or fix the test path)")
            return REAL_SUBPROCESS_RUN(cmd, **kw)
        self._real_run_before_guard = tal.subprocess.run
        tal.subprocess.run = guard

    def tearDown(self):
        tal.subprocess.run = self._real_run_before_guard

    @classmethod
    def setUpClass(cls):
        cls.tmp = Path(tempfile.mkdtemp(prefix="tal-test-"))
        cls.server = M1TestServer(cls.tmp / "m1")
        cls.server.env["AIEO_PLATFORM_ADMIN_PASSWORD"] = ADMIN_PW
        cls.server.start()
        cls.owner = M1Client(cls.server.base)
        cls.owner.login("OWNER", ADMIN_PW)
        cls.tokens = {}
        for aid, atype, role, issue in (
            ("GPT-04", "reviewer", "test-acceptance-session", False),
            ("ENGINE-03", "system", "test-acceptance-leg-engine", True),
            ("DEV-EXEC-01", "developer", "dev-executor", False),
            ("GPT-03", "reviewer", "code-review-session", False),   # 夹具 review report 登记者
        ):
            code, resp = cls.owner.post("/api/v1/agents", {"agent_id": aid, "agent_type": atype,
                                                           "role": role, "issue_service_token": issue})
            if code not in (200, 201, 409):
                raise AssertionError(f"agent {aid} create failed HTTP {code}: {resp}")
            if issue and isinstance(resp, dict) and resp.get("service_token"):
                cls.tokens[aid] = resp["service_token"]
        if "ENGINE-03" not in cls.tokens:
            raise AssertionError("ENGINE-03 service token not issued on fresh test DB")
        cls.orig_runtime = tal.RUNTIME_DIR
        cls.orig_dispatch_logs = tal.DISPATCH_LOG_DIR
        cls.orig_repo_root = tal.REPO_ROOT
        tal.RUNTIME_DIR = cls.tmp / "runtime"
        tal.DISPATCH_LOG_DIR = cls.tmp / "dispatch-logs"
        # 项目/批次
        code, resp = cls.owner.post("/api/v1/projects", {
            "project_id": "PRJ-TALTEST", "name": "test-acceptance-leg tests",
            "description": "b-20261117-gpt04-test-acceptance-leg S3 test project"})
        assert code in (200, 201, 409), resp
        code, resp = cls.owner.post("/api/v1/batches", {
            "project_id": "PRJ-TALTEST", "requirement": "test-acceptance-leg test batch",
            "engineering_standard_version": "1.0.0", "knowledge_base_commit": "0" * 40})
        assert code in (200, 201), resp
        cls.batch_id = resp.get("batch_id") or resp.get("id")
        # 夹具仓库（材料 manifest git 基准 + F-003 证据文件落点；REPO_ROOT 重定向至此）
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
        (cls.fixture / "task-brief.md").write_text("# 夹具任务书\n目标：测试验收腿\n", encoding="utf-8")
        git("add", ".")
        git("commit", "-m", "material base")
        cls.base_commit = git("rev-parse", "HEAD").strip()
        tal.REPO_ROOT = cls.fixture   # _load_test_fact 本地读盘 + material_manifest git -C 基准

    @classmethod
    def tearDownClass(cls):
        cls.server.stop()
        tal.RUNTIME_DIR = cls.orig_runtime
        tal.DISPATCH_LOG_DIR = cls.orig_dispatch_logs
        tal.REPO_ROOT = cls.orig_repo_root
        with contextlib.suppress(Exception):
            import shutil
            shutil.rmtree(cls.tmp, ignore_errors=True)

    # ------------------------------------------------------------------
    # 夹具：每测试独立 TEST_ACCEPTANCE 态任务（PLAN→…→TEST_ACCEPTANCE 停；含
    # execution/claim、review report（ACCEPTED 证据门前置）与 F-003 报告 artifact）
    # ------------------------------------------------------------------
    def make_leg(self, tag: str, fact: str = "EXECUTED_PASS", reply: str | None = None,
                 fail_first: bool = False, material_missing_from_commit: bool = False,
                 acceptance_criteria: list[str] | None = None,
                 fact_commit_mismatch: bool = False, fact_exec_mismatch: bool = False,
                 fact_report_missing: bool = False):
        """建任务→TEST_ACCEPTANCE（停）→注册 review report+测试报告 artifact→
        返回 (leg, task_id, ctx|None, fact, execution_id)。"""
        self._leg_seq = getattr(self.__class__, "_leg_seq", 0) + 1
        self.__class__._leg_seq = self._leg_seq
        run_key = f"913{self._leg_seq:03d}"
        mat = self.fixture / f"acceptance-{tag}.md"
        mat.write_text(f"# 验收材料 {tag}\n标准：测试证据可追溯\n", encoding="utf-8")
        self.git("add", ".")
        self.git("commit", "-m", f"material {tag}")
        commit = self.git("rev-parse", "HEAD").strip()
        if material_missing_from_commit:
            (self.fixture / f"acceptance-{tag}.md").unlink()
            self.git("add", "-A")
            self.git("commit", "-m", f"remove {tag}")
            anchor = self.git("rev-parse", "HEAD").strip()
        else:
            anchor = commit

        code, resp = self.owner.post("/api/v1/tasks", {
            "batch_id": self.batch_id, "title": f"tal test task {tag}",
            "description": "test acceptance leg test task", "priority": "P1",
            "files_scope": [f"acceptance-{tag}.md"],
            "acceptance_criteria": acceptance_criteria or [f"acceptance-{tag}.md criteria covered"],
            "engineering_standard_version": "1.0.0",
            "knowledge_base_commit": self.base_commit, "dependencies": []})
        self.assertEqual(code, 201, f"task create: {resp}")
        task_id = resp.get("task_id") or resp.get("id")
        events = (("PLAN", "01"), ("ARCH_REVIEW", "02"), ("PASS", "03"))
        for event, tail in events:
            code, resp = self.owner.post(f"/api/v1/tasks/{task_id}/events",
                                         {"event": event, "event_id": f"EVT-FIX-{tag}-{tail}"})
            self.assertIn(code, (200, 201), f"fixture event {event}: {resp}")
        code, resp = self.owner.post(f"/api/v1/tasks/{task_id}/claim", {
            "agent_id": "DEV-EXEC-01", "base_commit": self.base_commit,
            "correlation_id": "CORR-990001"})
        self.assertIn(code, (200, 201), f"claim: {resp}")
        execution_id = resp.get("execution_id") or ((resp.get("task") or {}).get("latest_execution") or {}).get("execution_id")
        for event, tail in (("START", "04"), ("DEVELOPMENT_COMPLETED", "05"),
                            ("GIT_VALIDATE", "06"), ("PASS", "07"), ("PASS", "08")):
            code, resp = self.owner.post(f"/api/v1/tasks/{task_id}/events",
                                         {"event": event, "event_id": f"EVT-FIX-{tag}-{tail}"})
            self.assertIn(code, (200, 201), f"fixture event {event}: {resp}")
        code, task = self.owner.get(f"/api/v1/tasks/{task_id}")
        self.assertEqual(task.get("status"), "TEST_ACCEPTANCE", f"fixture chain: {task}")
        # ACCEPTED 证据门前置：review report（TEST_ACCEPTANCE 态登记不推进，reports.py:163）
        pkg_hash = task.get("task_package_hash")
        code, resp = self.owner.post("/api/v1/reports/review", {
            "task_id": task_id, "execution_id": execution_id, "reviewed_commit": commit,
            "reviewer": "GPT-03", "result": "PASS",
            "task_package_hash": pkg_hash or "a" * 64,
            "base_commit": self.base_commit, "engineering_standard_version": "1.0.0",
            "knowledge_base_commit": self.base_commit, "payload": {"summary": "fixture review"}})
        self.assertIn(code, (200, 201, 202), f"fixture review report: {resp}")
        # F-003 测试报告 artifact（事实源；本地文件于 REPO_ROOT 下）
        ev_dir = self.fixture / "evidence"
        ev_dir.mkdir(exist_ok=True)
        f003 = {
            "task_id": task_id, "execution_id": execution_id,
            "commit_sha": SYNTH_COMMIT if not fact_commit_mismatch else "d" * 40,
            "execution_result": fact, "result": "PASS" if fact == "EXECUTED_PASS" else "REWORK",
            "payload": {"worker": "F-003 fixture"},
        }
        if fact_exec_mismatch:
            f003["execution_id"] = "EXEC-999"
        report_path = ev_dir / f"test-report-{tag}.json"
        if fact_report_missing:
            report_path.unlink(missing_ok=True)
        else:
            report_path.write_text(json.dumps(f003, ensure_ascii=False), encoding="utf-8")
        code, art = self.owner.post("/api/v1/artifacts", {
            "task_id": task_id, "type": "TEST_LOG", "path": f"evidence/test-report-{tag}.json",
            "sha256": hashlib.sha256(report_path.read_bytes()).hexdigest()
            if report_path.is_file() else "e" * 64})
        self.assertIn(code, (200, 201, 202), f"artifact: {art}")
        artifact_id = art.get("artifact_id") or art.get("id")
        leg = tal.TestAcceptanceLeg(run_key=run_key, task_id=task_id, project_id="PRJ-TALTEST",
                                    execution_id=execution_id, commit_sha=SYNTH_COMMIT,
                                    test_report_artifact_id=artifact_id,
                                    evidence_artifact_ids=[],
                                    input_material_commit=anchor,
                                    material_files=[f"acceptance-{tag}.md"],
                                    m1_url=self.server.base, token=self.tokens["ENGINE-03"],
                                    marker_text=f"[GPT04-R1|{tag}]",
                                    material_base_commit=self.base_commit)
        ctx = None
        if reply is not None:
            wrapper, calls = make_dispatch_double(reply, tal.DISPATCH_LOG_DIR, fail_first=fail_first)
            ctx = (wrapper, calls)
        return leg, task_id, ctx, fact, execution_id

    @contextlib.contextmanager
    def dispatch_double(self, wrapper):
        real_run = tal.subprocess.run
        tal.subprocess.run = wrapper
        try:
            yield
        finally:
            tal.subprocess.run = real_run

    @staticmethod
    def reply_for(result: str = "PASS", fact: str = "EXECUTED_PASS", extra: str = "") -> str:
        body = json.dumps({"result": result, "execution_result_observed": fact,
                           "summary": {"PASS": "验收标准逐项覆盖，证据齐备",
                                       "REWORK": "验收标准两项未覆盖，须补测试",
                                       "BLOCKED": "执行证据链断裂，验收阻塞须人工"}[result],
                           "findings": [] if result == "PASS" else ["异常场景未覆盖"],
                           "required_boundaries": ["F-003 证据事实不可被回复覆盖"]},
                          ensure_ascii=False)
        return f"ChatGPT 说：\n```json\n{body}\n```{extra}"

    # ------------------------------------------------------------------
    # 白名单与幂等标识（charter A-1 定稿 7 端点+排除清单）
    # ------------------------------------------------------------------
    def test_01_engine03_whitelist_guards(self):
        client = tal.EngineM1Client("http://127.0.0.1:1", "tok",
                                    whitelist=tal.GPT04_WHITELIST,
                                    event_whitelist=tal.GPT04_EVENT_WHITELIST,
                                    event_forbidden=tal.GPT04_EVENT_FORBIDDEN)
        for m, p in (("GET", "/api/v1/tasks/T-P1-001"),
                     ("GET", "/api/v1/tasks/T-P1-001/dependencies"),
                     ("GET", "/api/v1/artifacts/ART-1"),
                     ("GET", "/api/v1/reports?type=test&task_id=T-P1-001"),
                     ("POST", "/api/v1/artifacts"),
                     ("POST", "/api/v1/messages"),
                     ("POST", "/api/v1/reports/test")):
            client.check_whitelisted(m, p)  # 不抛即过（A-1 定稿 7 端点）
        for m, p in (("POST", "/api/v1/tasks/T-P1-001/events"),   # 排除：推进由端点内原子完成
                     ("POST", "/api/v1/agents"),                  # bootstrap 一次性，运行期禁
                     ("POST", "/api/v1/approvals"),
                     ("POST", "/api/v1/messages/msg-1/ack"),
                     ("POST", "/api/v1/reports/review"),          # GPT-03 腿职责
                     ("GET", "/api/v1/board"),                    # 白名单外
                     ("POST", "/api/v1/batches"),
                     ("DELETE", "/api/v1/artifacts/x")):
            with self.assertRaises(OrchestrationError) as cm:
                client.check_whitelisted(m, p)
            self.assertIn("whitelist", str(cm.exception))
        for ev in ("PASS", "REWORK", "BLOCKED", "CANCEL", "GIT_VALIDATE"):
            with self.assertRaises(OrchestrationError) as cm:
                client.check_event(ev)
            self.assertTrue("forbidden" in str(cm.exception) or "whitelist" in str(cm.exception))
        # 默认参数路径=GPT-03 附录 B 行为不变（既有腿零修改的回归锚）
        d = rl.EngineM1Client("http://127.0.0.1:1", "tok")
        d.check_whitelisted("GET", "/api/v1/board")
        d.check_whitelisted("POST", "/api/v1/reports/review")
        d.check_event("GIT_VALIDATE")

    def test_02_idempotent_ids_deterministic(self):
        kw = dict(task_id="T-P1-001", project_id="PRJ-TALTEST", execution_id="EXEC-001",
                  commit_sha=SYNTH_COMMIT, test_report_artifact_id="ART-1",
                  evidence_artifact_ids=[], input_material_commit="a" * 40,
                  material_files=["x.md"], m1_url="http://127.0.0.1:1", token="t",
                  material_base_commit="b" * 40)
        a = tal.TestAcceptanceLeg(run_key="913901", **kw)
        b = tal.TestAcceptanceLeg(run_key="913901", **kw)
        self.assertEqual(a.idem_keys, b.idem_keys)
        self.assertEqual(a.message_id(), b.message_id())
        self.assertEqual(a.idem_keys["idempotency_key"], "913901-test-acceptance-round-1")
        self.assertRegex(a.message_id(), r"^MSG-\d{8}-\d{6}$")

    # ------------------------------------------------------------------
    # A0 前置核查 + F-003 事实读入 fail-closed（D3/G2-04）
    # ------------------------------------------------------------------
    def test_03_precheck_failures(self):
        # 状态不符（提前推进到 ACCEPTED 后 a0 拒绝）
        leg, task_id, _, _, _ = self.make_leg("t03a")
        code, resp = self.owner.post(f"/api/v1/tasks/{task_id}/events",
                                     {"event": "REWORK", "event_id": "EVT-t03a-rw"})
        self.assertIn(code, (200, 201), resp)   # 提前推进到 REWORK
        with self.assertRaises(OrchestrationError) as cm:
            leg.a0_precheck()
        self.assertIn("status", str(cm.exception))
        # BLOCKED 态同样拒绝（A-3 行12：engine 不触碰任务级 BLOCKED）
        leg2, task2, _, _, _ = self.make_leg("t03b")
        code, resp = self.owner.post(f"/api/v1/tasks/{task2}/events",
                                     {"event": "BLOCKED", "event_id": "EVT-t03b-blk",
                                      "blocked_reason": "fixture", "blocked_owner": "OWNER",
                                      "unblock_condition": "fixture"})
        self.assertIn(code, (200, 201), resp)
        with self.assertRaises(OrchestrationError) as cm:
            leg2.a0_precheck()
        self.assertIn("status", str(cm.exception))

    def test_04_latest_execution_drift_fail_closed(self):
        leg, task_id, _, _, _ = self.make_leg("t04", fact="EXECUTED_PASS")
        drifted = tal.TestAcceptanceLeg(run_key="913903", task_id=task_id,
                                        project_id="PRJ-TALTEST", execution_id="EXEC-777",
                                        commit_sha=SYNTH_COMMIT,
                                        test_report_artifact_id=leg.test_report_artifact_id,
                                        evidence_artifact_ids=[],
                                        input_material_commit=leg.input_material_commit,
                                        material_files=leg.material_files,
                                        m1_url=self.server.base, token=self.tokens["ENGINE-03"],
                                        material_base_commit=self.base_commit)
        with self.assertRaises(OrchestrationError) as cm:
            drifted.a0_precheck()
        self.assertIn("latest_execution", str(cm.exception))

    def test_05_fact_loading_fail_closed(self):
        # fact execution_id 不一致（D3 绑定）
        leg, task_id, _, _, _ = self.make_leg("t05a", fact="EXECUTED_PASS", fact_exec_mismatch=True)
        with self.assertRaises(OrchestrationError) as cm:
            leg.a0_precheck()
        self.assertIn("execution_id", str(cm.exception))
        # 本地证据文件缺失
        leg2, task2, _, _, _ = self.make_leg("t05b", fact="EXECUTED_PASS", fact_report_missing=True)
        with self.assertRaises(OrchestrationError) as cm:
            leg2.a0_precheck()
        self.assertIn("missing", str(cm.exception))

    # ------------------------------------------------------------------
    # A1 简报：绑定字段+超限
    # ------------------------------------------------------------------
    def test_06_brief_bound_fields(self):
        leg, task_id, _, fact, _ = self.make_leg("t06")
        task, pending = leg.a0_precheck()
        brief = leg.a1_compose_brief(task, pending, fact)
        self.assertIn(leg.marker_text, brief)
        self.assertIn("EXECUTED_PASS", brief)
        a1 = leg.ledger.state_flags().get("A1_BRIEF") or {}
        self.assertTrue(a1.get("brief_sha256"))
        self.assertEqual(a1.get("input_material_commit"), leg.input_material_commit)
        self.assertTrue(a1.get("input_material_manifest_sha256"))
        self.assertLessEqual(len(brief.encode("utf-8")), tal.OUTBOUND_LIMIT)

    def test_07_brief_over_limit_fails_no_truncation(self):
        leg, task_id, _, fact, _ = self.make_leg(
            "t07", acceptance_criteria=["标准" + "超长验收标准描述" * 200])
        task, pending = leg.a0_precheck()
        with self.assertRaises(OrchestrationError) as cm:
            leg.a1_compose_brief(task, pending, fact)
        self.assertIn("hard limit", str(cm.exception))
        self.assertFalse((leg.run_dir / "brief.txt").exists())

    def test_08_manifest_anchor_missing_fail_closed(self):
        leg, task_id, _, fact, _ = self.make_leg("t08", material_missing_from_commit=True)
        task, pending = leg.a0_precheck()
        with self.assertRaises(OrchestrationError) as cm:
            leg.a1_compose_brief(task, pending, fact)
        self.assertIn("not in commit", str(cm.exception))

    # ------------------------------------------------------------------
    # A1 正常验收轮（EXECUTED_PASS+PASS→ACCEPTED；含 ACCEPTED 证据门）
    # ------------------------------------------------------------------
    def test_09_full_flow_pass_accepted(self):
        leg, task_id, ctx, fact, _ = self.make_leg("t09", fact="EXECUTED_PASS",
                                                   reply=self.reply_for("PASS", "EXECUTED_PASS"))
        with self.dispatch_double(ctx[0]):
            rc = leg.run()
        self.assertEqual(rc, 0)
        code, task = self.owner.get(f"/api/v1/tasks/{task_id}")
        self.assertEqual(task.get("status"), "ACCEPTED")   # 含 ACCEPTED 证据门核验
        flags = leg.ledger.state_flags()
        self.assertIsNotNone(flags.get("A4_TEST_REPORT"))
        self.assertIsNotNone(flags.get("A5_FINAL_STATE"))
        self.assertEqual(flags["A5_FINAL_STATE"]["status_after"], "ACCEPTED")

    # ------------------------------------------------------------------
    # A2 REWORK 轮（EXECUTED_FAIL+REWORK 允许；EXECUTED_PASS+REWORK 允许）
    # ------------------------------------------------------------------
    def test_10_rework_from_exec_fail(self):
        leg, task_id, ctx, fact, _ = self.make_leg("t10", fact="EXECUTED_FAIL",
                                                   reply=self.reply_for("REWORK", "EXECUTED_FAIL"))
        with self.dispatch_double(ctx[0]):
            rc = leg.run()
        self.assertEqual(rc, 0)
        code, task = self.owner.get(f"/api/v1/tasks/{task_id}")
        self.assertEqual(task.get("status"), "REWORK")
        # REWORK 不自动重验：无新派单（dispatch 目录计数=1）
        self.assertEqual(ctx[1]["n"], 1)

    def test_11_rework_from_exec_pass_allowed(self):
        leg, task_id, ctx, fact, _ = self.make_leg("t11", fact="EXECUTED_PASS",
                                                   reply=self.reply_for("REWORK", "EXECUTED_PASS"))
        with self.dispatch_double(ctx[0]):
            rc = leg.run()
        self.assertEqual(rc, 0)
        code, task = self.owner.get(f"/api/v1/tasks/{task_id}")
        self.assertEqual(task.get("status"), "REWORK")

    # ------------------------------------------------------------------
    # §4 定稿矩阵禁止组合（G2-01/02）：fail-closed 不登记
    # ------------------------------------------------------------------
    def test_12_matrix_forbidden_exec_fail_pass(self):
        leg, task_id, ctx, fact, _ = self.make_leg("t12", fact="EXECUTED_FAIL",
                                                   reply=self.reply_for("PASS", "EXECUTED_FAIL"))
        with self.dispatch_double(ctx[0]):
            rc = leg.run()
        self.assertEqual(rc, 2)
        reason = leg.ledger.state_flags().get("LEG_LEVEL_BLOCKED", {}).get("reason", "")
        self.assertIn("forbidden combination", reason)
        code, task = self.owner.get(f"/api/v1/tasks/{task_id}")
        self.assertEqual(task.get("status"), "TEST_ACCEPTANCE")   # M1 不动
        self.assertEqual(ctx[1]["n"], 1)   # 派单一次（A3 拦截）
        code, resp = self.owner.get(f"/api/v1/reports?type=test&task_id={task_id}")
        items = resp.get("items") if isinstance(resp, dict) else resp
        self.assertEqual(len(items or []), 0)   # 无登记

    def test_13_matrix_forbidden_claimed_only_and_not_executed(self):
        leg, task_id, ctx, fact, _ = self.make_leg("t13a", fact="CLAIMED_ONLY",
                                                   reply=self.reply_for("PASS", "CLAIMED_ONLY"))
        with self.dispatch_double(ctx[0]):
            rc = leg.run()
        self.assertEqual(rc, 2)
        self.assertIn("forbidden combination",
                      leg.ledger.state_flags().get("LEG_LEVEL_BLOCKED", {}).get("reason", ""))
        leg2, task2, ctx2, fact2, _ = self.make_leg("t13b", fact="NOT_EXECUTED",
                                                    reply=self.reply_for("REWORK", "NOT_EXECUTED"))
        with self.dispatch_double(ctx2[0]):
            rc2 = leg2.run()
        self.assertEqual(rc2, 2)
        self.assertIn("forbidden combination",
                      leg2.ledger.state_flags().get("LEG_LEVEL_BLOCKED", {}).get("reason", ""))

    def test_14_observed_mismatch_fail_closed(self):
        # G2-04：回复复述与 F-003 事实不一致→fail-closed（不采信回复值）
        leg, task_id, ctx, fact, _ = self.make_leg("t14", fact="EXECUTED_FAIL",
                                                   reply=self.reply_for("REWORK", "EXECUTED_PASS"))
        with self.dispatch_double(ctx[0]):
            rc = leg.run()
        self.assertEqual(rc, 2)
        reason = leg.ledger.state_flags().get("LEG_LEVEL_BLOCKED", {}).get("reason", "")
        self.assertIn("execution_result_observed", reason)
        code, task = self.owner.get(f"/api/v1/tasks/{task_id}")
        self.assertEqual(task.get("status"), "TEST_ACCEPTANCE")

    # ------------------------------------------------------------------
    # A7 BLOCKED 结论：artifacts+messages 留证，/reports/test 不调用，M1 不动
    # ------------------------------------------------------------------
    def test_15_blocked_verdict_register_only(self):
        leg, task_id, ctx, fact, _ = self.make_leg("t15", fact="EXECUTED_PASS",
                                                   reply=self.reply_for("BLOCKED", "EXECUTED_PASS"))
        with self.dispatch_double(ctx[0]):
            rc = leg.run()
        self.assertEqual(rc, 0)
        code, task = self.owner.get(f"/api/v1/tasks/{task_id}")
        self.assertEqual(task.get("status"), "TEST_ACCEPTANCE")   # M1 不动（D5）
        flags = leg.ledger.state_flags()
        self.assertIsNotNone(flags.get("A4_MESSAGE"))
        self.assertIsNotNone(flags.get("A4_BLOCKED_REGISTERED_ONLY"))
        self.assertIsNone(flags.get("A4_TEST_REPORT"))   # /reports/test 未调用
        code, resp = self.owner.get(f"/api/v1/reports?type=test&task_id={task_id}")
        items = resp.get("items") if isinstance(resp, dict) else resp
        self.assertEqual(len(items or []), 0)

    # ------------------------------------------------------------------
    # A3 契约校验失败：保留原始 artifact 不登记（L-008）
    # ------------------------------------------------------------------
    def test_16_contract_fail_keeps_raw_no_registration(self):
        bad = json.dumps({"result": "PASS", "execution_result_observed": "EXECUTED_PASS",
                          "summary": "格式错位", "findings": {"not": "string array"}},
                         ensure_ascii=False)
        leg, task_id, ctx, fact, _ = self.make_leg("t16", fact="EXECUTED_PASS",
                                                   reply=f"ChatGPT 说：\n```json\n{bad}\n```")
        with self.dispatch_double(ctx[0]):
            rc = leg.run()
        self.assertEqual(rc, 2)
        self.assertTrue((leg.run_dir / "reply.txt").is_file())
        self.assertTrue((leg.run_dir / "ajv-failure.json").is_file())
        flags = leg.ledger.state_flags()
        self.assertIsNone(flags.get("A4_MESSAGE"))
        code, task = self.owner.get(f"/api/v1/tasks/{task_id}")
        self.assertEqual(task.get("status"), "TEST_ACCEPTANCE")

    # ------------------------------------------------------------------
    # A4 duplicate 409 RES-0003：非幂等返回语义——先 GET 五字段核实
    # ------------------------------------------------------------------
    def test_17_duplicate_409_verified_then_done(self):
        leg, task_id, ctx, fact, _ = self.make_leg("t17", fact="EXECUTED_PASS",
                                                   reply=self.reply_for("PASS", "EXECUTED_PASS"))
        real_post = leg.engine.post
        calls = {"n": 0}

        def post_409_after_real(path, body, timeout=None):
            out = real_post(path, body, timeout=timeout)   # 真实登记+推进（服务端已生效）
            if path == "/api/v1/reports/test":
                calls["n"] += 1
                return 409, {"code": "RES-0003", "message": "DUPLICATE_MESSAGE (injected)"}
            return out
        leg.engine.post = post_409_after_real
        with self.dispatch_double(ctx[0]):
            rc = leg.run()
        self.assertEqual(rc, 0)   # GET 核实已登记→接续→终态核对过
        self.assertEqual(calls["n"], 1)
        self.assertIsNotNone(leg.ledger.state_flags().get("A4_DUPLICATE_OK"))
        code, task = self.owner.get(f"/api/v1/tasks/{task_id}")
        self.assertEqual(task.get("status"), "ACCEPTED")

    def test_18_duplicate_409_unverified_fail_closed(self):
        leg, task_id, ctx, fact, _ = self.make_leg("t18", fact="EXECUTED_PASS",
                                                   reply=self.reply_for("PASS", "EXECUTED_PASS"))
        real_post = leg.engine.post
        calls = {"n": 0}

        def post_409_no_registration(path, body, timeout=None):
            if path == "/api/v1/reports/test":
                calls["n"] += 1
                return 409, {"code": "RES-0003", "message": "DUPLICATE_MESSAGE (injected)"}
            return real_post(path, body, timeout=timeout)
        leg.engine.post = post_409_no_registration
        with self.dispatch_double(ctx[0]):
            rc = leg.run()
        self.assertEqual(rc, 2)   # 禁盲重试：仅一次 POST + GET 核实未确认→腿级 BLOCKED
        self.assertEqual(calls["n"], 1)
        code, task = self.owner.get(f"/api/v1/tasks/{task_id}")
        self.assertEqual(task.get("status"), "TEST_ACCEPTANCE")

    def test_19_atomicity_anomaly_row9(self):
        # 报告"已登记"（腿视角 201）但 M1 未推进=原子性异常→A-3 行9 腿级 BLOCKED
        leg, task_id, ctx, fact, _ = self.make_leg("t19", fact="EXECUTED_PASS",
                                                   reply=self.reply_for("PASS", "EXECUTED_PASS"))
        real_post = leg.engine.post

        def post_fake_201(path, body, timeout=None):
            if path == "/api/v1/reports/test":
                return 201, {}   # 注入：服务端实际未登记未推进
            return real_post(path, body, timeout=timeout)
        leg.engine.post = post_fake_201
        with self.dispatch_double(ctx[0]):
            rc = leg.run()
        self.assertEqual(rc, 2)
        code, task = self.owner.get(f"/api/v1/tasks/{task_id}")
        self.assertEqual(task.get("status"), "TEST_ACCEPTANCE")

    # ------------------------------------------------------------------
    # A5 崩溃窗口：A4_MESSAGE 已登记而 /reports/test 前进程死→resume GET 核实→行8 原键重试
    # ------------------------------------------------------------------
    def test_20_crash_window_recovery_via_m1_query(self):
        leg, task_id, ctx, fact, _ = self.make_leg("t20", fact="EXECUTED_PASS",
                                                   reply=self.reply_for("PASS", "EXECUTED_PASS"))
        real_post = leg.engine.post

        def post_die_before_report(path, body, timeout=None):
            if path == "/api/v1/reports/test":
                raise RuntimeError("injected crash before POST /reports/test")
            return real_post(path, body, timeout=timeout)
        leg.engine.post = post_die_before_report
        with self.dispatch_double(ctx[0]):
            with self.assertRaises(RuntimeError):
                leg.run()
        flags = leg.ledger.state_flags()
        self.assertIsNotNone(flags.get("A4_MESSAGE"))
        self.assertIsNone(flags.get("A4_TEST_REPORT"))
        leg2 = tal.TestAcceptanceLeg(run_key=leg.run_key, task_id=task_id,
                                     project_id="PRJ-TALTEST", execution_id=leg.execution_id,
                                     commit_sha=SYNTH_COMMIT,
                                     test_report_artifact_id=leg.test_report_artifact_id,
                                     evidence_artifact_ids=[],
                                     input_material_commit=leg.input_material_commit,
                                     material_files=leg.material_files,
                                     m1_url=self.server.base, token=self.tokens["ENGINE-03"],
                                     material_base_commit=self.base_commit,
                                     marker_text=leg.marker_text)
        rc = leg2.resume()
        self.assertEqual(rc, 0)
        code, task = self.owner.get(f"/api/v1/tasks/{task_id}")
        self.assertEqual(task.get("status"), "ACCEPTED")
        self.assertIsNotNone(leg2.ledger.state_flags().get("A4_TEST_REPORT"))

    # ------------------------------------------------------------------
    # resume 终态行（A-3 行10/12）+发送意图无确认（行3 fail-closed）
    # ------------------------------------------------------------------
    def test_21_resume_terminal_rows(self):
        leg, task_id, ctx, fact, _ = self.make_leg("t21a", fact="EXECUTED_PASS",
                                                   reply=self.reply_for("PASS", "EXECUTED_PASS"))
        with self.dispatch_double(ctx[0]):
            self.assertEqual(leg.run(), 0)
        leg2 = tal.TestAcceptanceLeg(run_key=leg.run_key, task_id=task_id,
                                     project_id="PRJ-TALTEST", execution_id=leg.execution_id,
                                     commit_sha=SYNTH_COMMIT,
                                     test_report_artifact_id=leg.test_report_artifact_id,
                                     evidence_artifact_ids=[],
                                     input_material_commit=leg.input_material_commit,
                                     material_files=leg.material_files,
                                     m1_url=self.server.base, token=self.tokens["ENGINE-03"],
                                     material_base_commit=self.base_commit,
                                     marker_text=leg.marker_text)
        rc = leg2.resume()
        self.assertEqual(rc, 0)
        self.assertIsNotNone(leg2.ledger.state_flags().get("RESUME_DONE"))   # A-3 行10 终态语义
        # BLOCKED（行12）：owner 提交任务级 BLOCKED→resume 拒绝触碰
        leg3, task3, _, _, _ = self.make_leg("t21b")
        code, resp = self.owner.post(f"/api/v1/tasks/{task3}/events",
                                     {"event": "BLOCKED", "event_id": "EVT-FIX-t21b-BLK",
                                      "blocked_reason": "owner manual block (fixture)",
                                      "blocked_owner": "OWNER",
                                      "unblock_condition": "test fixture condition"})
        self.assertIn(code, (200, 201), f"fixture BLOCKED event: {resp}")
        rc3 = leg3.resume()
        self.assertEqual(rc3, 2)
        code, task = self.owner.get(f"/api/v1/tasks/{task3}")
        self.assertEqual(task.get("status"), "BLOCKED")

    def test_22_resume_intent_without_confirmation_fail_closed(self):
        leg, task_id, _, fact, _ = self.make_leg("t22")
        leg.ledger.append({"kind": "A2_SEND_INTENT_RECORDED", "attempt": 1,
                           "outcome": "INTENT"})   # 账本级注入：仅意图无确认
        rc = leg.resume()
        self.assertEqual(rc, 2)
        code, task = self.owner.get(f"/api/v1/tasks/{task_id}")
        self.assertEqual(task.get("status"), "TEST_ACCEPTANCE")
        self.assertIn("A-3", (leg.ledger.state_flags().get("LEG_LEVEL_BLOCKED") or {}).get("reason", ""))

    # ------------------------------------------------------------------
    # 发送失败分类（§5 行1：一次换会话重派；连续失败→腿级 BLOCKED）
    # ------------------------------------------------------------------
    def test_23_send_failure_one_redispatch(self):
        leg, task_id, ctx, fact, _ = self.make_leg("t23", fact="EXECUTED_PASS",
                                                   reply=self.reply_for("PASS", "EXECUTED_PASS"),
                                                   fail_first=True)
        with self.dispatch_double(ctx[0]):
            rc = leg.run()
        self.assertEqual(rc, 0)
        self.assertEqual(ctx[1]["n"], 2)   # 首发无证据→重派一次→成功
        code, task = self.owner.get(f"/api/v1/tasks/{task_id}")
        self.assertEqual(task.get("status"), "ACCEPTED")

    # ------------------------------------------------------------------
    # A3 采集 fail-closed：发送双验已过→禁重发（gpt_dispatch 仅一次）→人工 attach 完成登记
    # ------------------------------------------------------------------
    def test_24_collect_failed_recovery_via_attach(self):
        leg, task_id, ctx, fact, _ = self.make_leg("t24", fact="EXECUTED_PASS",
                                                   reply=self.reply_for("PASS", "EXECUTED_PASS"))
        calls = ctx[1]
        real_wrapper = ctx[0]

        def collect_fail_wrapper(cmd, **kw):
            joined = " ".join(map(str, cmd))
            if "gpt_dispatch.mjs" in joined:
                calls["n"] += 1
                if calls["n"] == 1:
                    ddir = tal.DISPATCH_LOG_DIR / "dispatch-collect-fail-t24"
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
        self.assertEqual(calls["n"], 1)   # 禁重发
        # 人工补采归档（完整现场含归属快照）→attach（同一 reply 同一幂等键）
        forensics = tal.DISPATCH_LOG_DIR / "manual-forensics-t24"
        forensics.mkdir(parents=True, exist_ok=True)
        reply_file = forensics / "reply.txt"
        reply_file.write_text(self.reply_for("PASS", "EXECUTED_PASS"), encoding="utf-8")
        (forensics / "result.json").write_text(json.dumps({
            "user_unit_key": "fallback-turn-1:0:user",
            "unit_count": 2,
            "conversation_url": "https://chatgpt.com/c/11111111-2222-4333-8444-555555555555",
            "completion_checks": {"final_stop_button_not_visible": True},
        }), encoding="utf-8")
        rc2 = leg.attach_reply(reply_file)
        self.assertEqual(rc2, 0)
        code, task = self.owner.get(f"/api/v1/tasks/{task_id}")
        self.assertEqual(task.get("status"), "ACCEPTED")

    # ------------------------------------------------------------------
    # 归属校验（GPT-02 P1-01/P1-1 同构）：键不一致/无效 fail-closed
    # ------------------------------------------------------------------
    def test_25_ownership_mismatch_fail_closed(self):
        # GPT-02 test_17 同型（账本级注入）：A2 确认键 ≠ 现场 located 键→a3 归属 fail-closed
        leg, task_id, _, fact, _ = self.make_leg("t25", fact="EXECUTED_PASS")
        leg.ledger.append({"kind": "A2_SEND_CONFIRMED", "attempt": 1,
                           "dispatch_dir": "dispatch-x",
                           "conversation_uuid": "https://chatgpt.com/c/11111111-2222-4333-8444-555555555555",
                           "sent_user_unit_key": "fallback-turn-9:0:user",   # ≠现场快照键
                           "outcome": "CONFIRMED"})
        forensics = tal.DISPATCH_LOG_DIR / "manual-t25"
        forensics.mkdir(parents=True, exist_ok=True)
        (forensics / "reply.txt").write_text(self.reply_for("PASS", fact), encoding="utf-8")
        (forensics / "result.json").write_text(json.dumps({
            "user_unit_key": "fallback-turn-1:0:user",   # located ≠ sent
            "conversation_url": "https://chatgpt.com/c/11111111-2222-4333-8444-555555555555",
        }), encoding="utf-8")
        rc = leg.attach_reply(forensics / "reply.txt")
        self.assertEqual(rc, 2)
        reason = leg.ledger.state_flags().get("LEG_LEVEL_BLOCKED", {}).get("reason", "")
        self.assertIn("ownership mismatch", reason)
        code, task = self.owner.get(f"/api/v1/tasks/{task_id}")
        self.assertEqual(task.get("status"), "TEST_ACCEPTANCE")

    # ------------------------------------------------------------------
    # A6 人工退路：无锚点 attach（显式 not_applicable）→同契约同幂等键登记
    # ------------------------------------------------------------------
    def test_26_attach_reply_manual_rework(self):
        leg, task_id, _, fact, _ = self.make_leg("t26", fact="EXECUTED_FAIL")   # 无替身：本腿未发送
        reply_file = self.tmp / "manual-t26.txt"
        reply_file.write_text(self.reply_for("REWORK", "EXECUTED_FAIL"), encoding="utf-8")
        rc = leg.attach_reply(reply_file)
        self.assertEqual(rc, 0)
        code, task = self.owner.get(f"/api/v1/tasks/{task_id}")
        self.assertEqual(task.get("status"), "REWORK")
        flags = leg.ledger.state_flags()
        self.assertIsNotNone(flags.get("A4_TEST_REPORT"))
        self.assertEqual(flags["A0_TEST_FACT"]["execution_result"], fact)

    def test_27_attach_blocked_register_only(self):
        leg, task_id, _, fact, _ = self.make_leg("t27", fact="EXECUTED_PASS")
        reply_file = self.tmp / "manual-t27.txt"
        reply_file.write_text(self.reply_for("BLOCKED", "EXECUTED_PASS"), encoding="utf-8")
        rc = leg.attach_reply(reply_file)
        self.assertEqual(rc, 0)
        code, task = self.owner.get(f"/api/v1/tasks/{task_id}")
        self.assertEqual(task.get("status"), "TEST_ACCEPTANCE")
        self.assertIsNone(leg.ledger.state_flags().get("A4_TEST_REPORT"))

    def test_28_attach_requires_test_acceptance(self):
        leg, task_id, _, fact, _ = self.make_leg("t28")
        code, resp = self.owner.post(f"/api/v1/tasks/{task_id}/events",
                                     {"event": "REWORK", "event_id": "EVT-t28-rw"})
        self.assertIn(code, (200, 201), resp)
        reply_file = self.tmp / "manual-t28.txt"
        reply_file.write_text(self.reply_for("PASS", "EXECUTED_PASS"), encoding="utf-8")
        rc = leg.attach_reply(reply_file)
        self.assertEqual(rc, 2)
        self.assertIn("TEST_ACCEPTANCE", (leg.ledger.state_flags().get("LEG_LEVEL_BLOCKED") or {}).get("reason", ""))

    # ------------------------------------------------------------------
    # RunKeyLock 跨进程互斥（Gate2 特别要求）
    # ------------------------------------------------------------------
    def test_29_run_key_lock_rejects_concurrent(self):
        leg, task_id, _, fact, _ = self.make_leg("t29")
        lock = tal.RunKeyLock(leg.run_dir, holder="external-simulation")
        lock.__enter__()
        try:
            with self.assertRaises(OrchestrationError) as cm:
                leg.run()
            self.assertIn("run_key lock", str(cm.exception))
        finally:
            lock.__exit__()
        # 释放后可再取
        with tal.RunKeyLock(leg.run_dir, holder="after-release"):
            pass

    # ------------------------------------------------------------------
    # setup-agents（OWNER bootstrap；幂等复用）
    # ------------------------------------------------------------------
    def test_30_setup_agents_idempotent(self):
        os.environ["AIEO_PLATFORM_ADMIN_USERNAME"] = "OWNER"
        os.environ["AIEO_PLATFORM_ADMIN_PASSWORD"] = ADMIN_PW
        orig_runtime = tal.RUNTIME_DIR
        tal.RUNTIME_DIR = self.tmp / "runtime-setup"
        tal.RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
        # 预置令牌库（setUpClass 已签发 ENGINE-03）：复用语义=409 时代理运行时令牌库（GPT-02 test_16 先例同型）
        (tal.RUNTIME_DIR / "service-tokens.json").write_text(
            json.dumps({"ENGINE-03": self.tokens["ENGINE-03"]}), encoding="utf-8")
        try:
            rc = tal.setup_agents(self.server.base)
            self.assertEqual(rc, 0)
            rc2 = tal.setup_agents(self.server.base)
            self.assertEqual(rc2, 0, "second run must reuse existing agents (409 RES-0002)")
            tok = json.loads((tal.RUNTIME_DIR / "service-tokens.json").read_text(encoding="utf-8"))
            self.assertIn("ENGINE-03", tok)
        finally:
            tal.RUNTIME_DIR = orig_runtime
            os.environ.pop("AIEO_PLATFORM_ADMIN_USERNAME", None)
            os.environ.pop("AIEO_PLATFORM_ADMIN_PASSWORD", None)


if __name__ == "__main__":
    unittest.main()
