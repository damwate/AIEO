# -*- coding: utf-8 -*-
"""S2-R2 整改测试 v2：runner 生成改占位符替换（避免 f-string 嵌套括号地狱）。"""
import json as _json

p = "phase1/tools/test_review_leg.py"
s = open(p, encoding="utf-8").read()

# 移除 v1 试图注入的 RUNNER_HELPER（若存在）与 v1 测试块（若有），再以 v2 重新注入
import re
# v1 的 helper/测试可能已部分写入——检查标记
if "_write_runner" in s:
    raise SystemExit("v1 patch already applied; manual cleanup required")

RUNNER_HELPER = '''
    _runner_reply = None

    def _write_runner(self, name, body, task_id, commit, patch_path, run_key):
        """生成独立 runner 脚本（真实子进程执行；自带 ChatGPT 边界替身）。占位符替换。"""
        tpl = """# -*- coding: utf-8 -*-
import json, os, sys, time
sys.path.insert(0, r"__TOOLS__")
import subprocess as _sp
import review_leg as _rl
from pathlib import Path

REAL_RUN = _sp.run
def _double(cmd, **kw):
    joined = " ".join(map(str, cmd))
    if "gpt_dispatch.mjs" in joined:
        droot = Path(r"__DROOT__")
        droot.mkdir(parents=True, exist_ok=True)
        n = len(list(droot.glob("dispatch-runner-*"))) + 1
        ddir = droot / ("dispatch-runner-" + str(n))
        ddir.mkdir(parents=True, exist_ok=True)
        cl = [str(a) for a in cmd]
        if "--message-file" in cl:
            mf = Path(cl[cl.index("--message-file") + 1])
            if mf.is_file():
                (ddir / "request.txt").write_bytes(mf.read_bytes())
        reply_text = __REPLY__
        (ddir / "reply.txt").write_text(reply_text, encoding="utf-8")
        (ddir / "result.json").write_text(json.dumps({
            "user_unit_key": "fallback-turn-0:0:user", "unit_count": 1,
            "conversation_url": "https://chatgpt.com/c/33333333-4444-4555-8666-777777777777",
            "completion_checks": {"send_double_verify": True}}, ensure_ascii=False), encoding="utf-8")
        class FP:
            returncode = 0
            stdout = b""
            stderr = b""
        return FP()
    return REAL_RUN(cmd, **kw)
_rl.subprocess.run = _double
_rl.RUNTIME_DIR = Path(r"__RUNTIME__")
_rl.DISPATCH_LOG_DIR = Path(r"__DROOT__")

__BODY__
"""
        tpl = tpl.replace("__TOOLS__", str(REPO_ROOT / "phase1" / "tools"))
        tpl = tpl.replace("__DROOT__", str(self.tmp / "dispatch-logs"))
        tpl = tpl.replace("__RUNTIME__", str(self.tmp / "runtime"))
        tpl = tpl.replace("__REPLY__", repr(self._runner_reply or ""))
        tpl = tpl.replace("__BODY__", body)
        rp = self.tmp / name
        rp.write_text(tpl, encoding="utf-8")
        return rp

    def _run_runner(self, runner, token, task_id, commit, patch_path, run_key, timeout=180):
        env = {**os.environ,
               "AIEO_PLATFORM_ADMIN_USERNAME": "OWNER",
               "AIEO_PLATFORM_ADMIN_PASSWORD": "rvl-test-admin-pw-2026-1115x"}
        cmd = [sys.executable, str(runner), self.server.base, token, task_id, commit,
               str(patch_path), run_key]
        return subprocess.run(cmd, cwd=str(REPO_ROOT), capture_output=True, text=True,
                              encoding="utf-8", errors="replace", env=env, timeout=timeout)

    def _make_runner_leg(self, tag):
        """为 runner 准备独立任务与凭据（返回 task_id/commit/patch）。"""
        import hashlib
        commit_file = self.fixture / ("work-" + tag + ".txt")
        commit_file.write_text("change for " + tag + "\\n", encoding="utf-8")
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
        return task_id, commit, patch_path
'''

RUNNER_TESTS = '''
    # ------------------------------------------------------------------
    # A7/A5② 真实进程重启现场（S2-R1 P2-02/P2-03 整改）：runner 子进程=真实独立进程，
    # 中断用 os._exit（现场不落终态）；resume 由第二个全新子进程执行（真·进程重启）。
    # ------------------------------------------------------------------
    def test_17_a7_real_process_restart_event_idempotent(self):
        """A7 真实现场：子进程提交 GIT_VALIDATE 后 os._exit（M1 已提交、客户端进程死）
        → 全新子进程 resume → 只读核实接续 → task_events 同 event_id 恰 1 条。"""
        self._runner_reply = ""
        task_id, commit, patch_path = self._make_runner_leg("rn17")
        run_key = "997017"
        token = self.tokens["ENGINE-01"]
        body1 = (
            "from review_leg import ReviewLeg\\n"
            "leg = ReviewLeg(run_key=" + repr(run_key) + ", task_id=" + repr(task_id) +
            ", project_id='PRJ-RVLTEST',\\n"
            "    reviewed_commit=" + repr(commit) + ", diff_artifact_id='ART-DUMMY-NOACCESS',\\n"
            "    diff_file=Path(" + repr(str(patch_path)) + "), fixture_repo=Path(" + repr(str(self.fixture)) + "),\\n"
            "    m1_url=sys.argv[1], token=sys.argv[2],\\n"
            "    marker_text='[GPT03-R1|" + run_key + "|" + task_id + "]')\\n"
            "leg.r0_precheck()\\n"
            "orig_post = leg.engine.post\\n"
            "def post_die(path, body, timeout=60.0):\\n"
            "    r = orig_post(path, body, timeout)\\n"
            "    if path.endswith('/events') and body.get('event') == 'GIT_VALIDATE':\\n"
            "        os._exit(9)\\n"
            "    return r\\n"
            "leg.engine.post = post_die\\n"
            "leg.r1_git_validate_and_pass()\\n"
            "print('RUNNER1_UNEXPECTED_COMPLETION')\\n"
        )
        r1 = self._write_runner("runner-a7-run.py", body1, task_id, commit, patch_path, run_key)
        proc1 = self._run_runner(r1, token, task_id, commit, patch_path, run_key)
        self.assertEqual(proc1.returncode, -9 if os.name != 'nt' else 9,
                         "runner1 dies at A7 injection (os._exit(9))")
        body2 = (
            "from review_leg import ReviewLeg\\n"
            "leg = ReviewLeg(run_key=" + repr(run_key) + ", task_id=" + repr(task_id) +
            ", project_id='PRJ-RVLTEST',\\n"
            "    reviewed_commit=" + repr(commit) + ", diff_artifact_id='ART-DUMMY-NOACCESS',\\n"
            "    diff_file=Path(" + repr(str(patch_path)) + "), fixture_repo=Path(" + repr(str(self.fixture)) + "),\\n"
            "    m1_url=sys.argv[1], token=sys.argv[2],\\n"
            "    marker_text='[GPT03-R1|" + run_key + "|" + task_id + "]')\\n"
            "rc = leg.resume()\\n"
            "print('RUNNER2_RC=' + str(rc))\\n"
            "assert rc == 0, 'resume failed'\\n"
        )
        r2 = self._write_runner("runner-a7-resume.py", body2, task_id, commit, patch_path, run_key)
        proc2 = self._run_runner(r2, token, task_id, commit, patch_path, run_key)
        self.assertIn("RUNNER2_RC= 0", proc2.stdout,
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
        task_id, commit, patch_path = self._make_runner_leg("rn18")
        self._runner_reply = self.reply_for(commit, "PASS")
        run_key = "997018"
        token = self.tokens["ENGINE-01"]
        body1 = (
            "from review_leg import ReviewLeg\\n"
            "leg = ReviewLeg(run_key=" + repr(run_key) + ", task_id=" + repr(task_id) +
            ", project_id='PRJ-RVLTEST',\\n"
            "    reviewed_commit=" + repr(commit) + ", diff_artifact_id='ART-DUMMY-NOACCESS',\\n"
            "    diff_file=Path(" + repr(str(patch_path)) + "), fixture_repo=Path(" + repr(str(self.fixture)) + "),\\n"
            "    m1_url=sys.argv[1], token=sys.argv[2],\\n"
            "    marker_text='[GPT03-R1|" + run_key + "|" + task_id + "]')\\n"
            "leg.r0_precheck()\\n"
            "leg.r1_git_validate_and_pass()\\n"
            "task = leg._refetch_task()\\n"
            "leg.r2_compose_brief(task)\\n"
            "ddir = leg.r3_dispatch(leg.run_dir.joinpath('brief.txt').read_text(encoding='utf-8'))\\n"
            "leg.r4_capture_and_validate(ddir, batch_id=task.get('batch_id'))\\n"
            "os._exit(9)\\n"
        )
        r1 = self._write_runner("runner-a5b-run.py", body1, task_id, commit, patch_path, run_key)
        proc1 = self._run_runner(r1, token, task_id, commit, patch_path, run_key)
        self.assertIn(proc1.returncode, (-9, 9),
                      "runner1 dies at A5② breakpoint (os._exit(9))")
        body2 = (
            "from review_leg import ReviewLeg\\n"
            "leg = ReviewLeg(run_key=" + repr(run_key) + ", task_id=" + repr(task_id) +
            ", project_id='PRJ-RVLTEST',\\n"
            "    reviewed_commit=" + repr(commit) + ", diff_artifact_id='ART-DUMMY-NOACCESS',\\n"
            "    diff_file=Path(" + repr(str(patch_path)) + "), fixture_repo=Path(" + repr(str(self.fixture)) + "),\\n"
            "    m1_url=sys.argv[1], token=sys.argv[2],\\n"
            "    marker_text='[GPT03-R1|" + run_key + "|" + task_id + "]')\\n"
            "rc = leg.resume()\\n"
            "print('RUNNER2_RC=' + str(rc))\\n"
            "assert rc == 0, 'resume failed'\\n"
        )
        r2 = self._write_runner("runner-a5b-resume.py", body2, task_id, commit, patch_path, run_key)
        proc2 = self._run_runner(r2, token, task_id, commit, patch_path, run_key)
        self.assertIn("RUNNER2_RC= 0", proc2.stdout,
                      "resume runner failed: " + proc2.stdout[-500:] + proc2.stderr[-400:])
        self.assertEqual(self.server.query(
            "SELECT COUNT(*) c FROM review_reports WHERE task_id=?", (task_id,))[0]["c"], 1)
        self.assertEqual(self.server.query(
            "SELECT COUNT(*) c FROM messages WHERE task_id=? AND message_type='CODE_REVIEW_SUBMITTED'",
            (task_id,))[0]["c"], 1)
        self.assertEqual(self.server.query(
            "SELECT status FROM tasks WHERE task_id=?", (task_id,))[0]["status"], "TEST_ACCEPTANCE")

    def test_16c_confirmed_send_missing_key_fails_closed_even_attach(self):'''
OLD_ANCHOR = '''    def test_16c_confirmed_send_missing_key_fails_closed_even_attach(self):'''
assert OLD_ANCHOR in s, "anchor not found"
s = s.replace(OLD_ANCHOR, RUNNER_TESTS.lstrip("\n"), 1)

HELPER_ANCHOR = '''    @staticmethod
    def reply_for(commit: str, result: str = "PASS", extra: str = "") -> str:'''
assert HELPER_ANCHOR in s, "helper anchor not found"
s = s.replace(HELPER_ANCHOR, RUNNER_HELPER.lstrip("\n") + "\n" + HELPER_ANCHOR, 1)

open(p, "w", encoding="utf-8", newline="\n").write(s)
print("v2 runner tests injected")
