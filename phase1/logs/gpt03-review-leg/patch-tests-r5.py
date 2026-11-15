# -*- coding: utf-8 -*-
"""S2-R2 整改测试：P2-02（A7 真实进程中断+重启接续）+P2-03（A5② 独立进程重启补登记）。
方案=测试内生成 runner 子进程（真实独立进程；runner 内安装 ChatGPT 边界替身），
主测试进程只监测与断言；resume 由第二个全新子进程执行（真·进程重启现场）。"""
import json as _json

p = "phase1/tools/test_review_leg.py"
s = open(p, encoding="utf-8").read()

RUNNER_HELPER = '''
    def _write_runner(self, name: str, body: str, token: str, task_id: str, commit: str,
                      patch_path, run_key: str) -> Path:
        """生成独立 runner 脚本（真实子进程执行；自带 ChatGPT 边界替身）。"""
        marker = f"[GPT03-R1|{run_key}|{task_id}]"
        runner = f'''# -*- coding: utf-8 -*-
import json, os, sys, time
sys.path.insert(0, r"{REPO_ROOT / 'phase1' / 'tools'}")
import subprocess as _sp
import review_leg as _rl
from pathlib import Path

REAL_RUN = _sp.run
def _double(cmd, **kw):
    joined = " ".join(map(str, cmd))
    if "gpt_dispatch.mjs" in joined:
        droot = Path(r"{self.tmp / 'dispatch-logs'}")
        droot.mkdir(parents=True, exist_ok=True)
        n = len(list(droot.glob("dispatch-runner-*"))) + 1
        ddir = droot / f"dispatch-runner-{{n}}"
        ddir.mkdir(parents=True, exist_ok=True)
        cl = [str(a) for a in cmd]
        if "--message-file" in cl:
            mf = Path(cl[cl.index("--message-file") + 1])
            if mf.is_file():
                (ddir / "request.txt").write_bytes(mf.read_bytes())
        (ddir / "reply.txt").write_text({self._runner_reply!r}, encoding="utf-8")
        (ddir / "result.json").write_text(json.dumps({{
            "user_unit_key": "fallback-turn-0:0:user", "unit_count": 1,
            "conversation_url": "https://chatgpt.com/c/33333333-4444-4555-8666-777777777777",
            "completion_checks": {{"send_double_verify": True}}}}, ensure_ascii=False), encoding="utf-8")
        class FP: returncode = 0; stdout = b""; stderr = b""
        return FP()
    return REAL_RUN(cmd, **kw)
_rl.subprocess.run = _double
_rl.RUNTIME_DIR = Path(r"{self.tmp / 'runtime'}")
_rl.DISPATCH_LOG_DIR = Path(r"{self.tmp / 'dispatch-logs'}")

{body}
'''
        rp = self.tmp / name
        rp.write_text(runner, encoding="utf-8")
        return rp
'''

OLD_ANCHOR = '''    def test_16c_confirmed_send_missing_key_fails_closed_even_attach(self):'''
NEW_BLOCK = '''    # ------------------------------------------------------------------
    # A7/A5② 真实进程重启现场（S2-R1 P2-02/P2-03 整改）：runner 子进程=真实独立进程，
    # 中断用 os._exit（现场不落终态）；resume 由第二个全新子进程执行。
    # ------------------------------------------------------------------
    _runner_reply = None

    def _run_runner(self, runner: Path, token: str, task_id: str, commit: str, patch_path,
                    run_key: str, timeout: int = 120):
        env = {**os.environ,
               "AIEO_PLATFORM_ADMIN_USERNAME": "OWNER",
               "AIEO_PLATFORM_ADMIN_PASSWORD": "rvl-test-admin-pw-2026-1115x"}
        cmd = [sys.executable, str(runner), self.server.base, token, task_id, commit,
               str(patch_path), run_key]
        return subprocess.run(cmd, cwd=str(REPO_ROOT), capture_output=True, text=True,
                              encoding="utf-8", errors="replace", env=env, timeout=timeout)

    def _make_runner_leg(self, tag: str):
        """为 runner 准备独立任务与凭据（返回 task_id/commit/patch/token）。"""
        import hashlib
        commit_file = self.fixture / f"work-{tag}.txt"
        commit_file.write_text(f"change for {tag}\\n", encoding="utf-8")
        self.git("add", ".")
        self.git("commit", "-m", f"work {tag}")
        commit = self.git("rev-parse", "HEAD").strip()
        patch_path = self.tmp / f"patch-{tag}.patch"
        patch_path.write_text(self.git("diff", f"{commit}~1", commit), encoding="utf-8")
        code, resp = self.owner.post("/api/v1/tasks", {
            "batch_id": self.batch_id, "title": f"rvl runner task {tag}",
            "description": "runner drill", "priority": "P1",
            "files_scope": [f"work-{tag}.txt"],
            "acceptance_criteria": [f"work-{tag}.txt ok"],
            "engineering_standard_version": "1.0.0",
            "knowledge_base_commit": self.base_commit, "dependencies": []})
        self.assertEqual(code, 201)
        task_id = resp.get("task_id") or resp.get("id")
        for event, tail in (("PLAN", "01"), ("ARCH_REVIEW", "02"), ("PASS", "03")):
            code, resp = self.owner.post(f"/api/v1/tasks/{task_id}/events",
                                         {"event": event, "event_id": f"EVT-RN-{tag}-{tail}"})
            self.assertIn(code, (200, 201))
        code, resp = self.owner.post(f"/api/v1/tasks/{task_id}/claim", {
            "agent_id": "DEV-EXEC-01", "base_commit": self.base_commit,
            "correlation_id": "CORR-997001"})
        self.assertIn(code, (200, 201))
        execution_id = resp.get("execution_id") or ((resp.get("task") or {}).get("latest_execution") or {}).get("execution_id")
        code, resp = self.owner.post(f"/api/v1/tasks/{task_id}/events",
                                     {"event": "START", "event_id": f"EVT-RN-{tag}-START"})
        self.assertIn(code, (200, 201))
        code, art = self.owner.post("/api/v1/artifacts", {
            "task_id": task_id, "type": "DIFF", "path": f"evidence/patch-{tag}.patch",
            "sha256": hashlib.sha256(patch_path.read_bytes()).hexdigest()})
        self.assertIn(code, (200, 201, 202))
        artifact_id = art.get("artifact_id") or art.get("id")
        code, resp = self.owner.post("/api/v1/commits", {
            "task_id": task_id, "execution_id": execution_id, "repository_id": self.repo_id,
            "branch": "main", "sha": commit, "base_commit": self.base_commit,
            "diff_artifact_id": artifact_id})
        self.assertIn(code, (200, 201, 202))
        code, resp = self.owner.post(f"/api/v1/tasks/{task_id}/events",
                                     {"event": "DEVELOPMENT_COMPLETED",
                                      "event_id": f"EVT-RN-{tag}-DEV"})
        self.assertIn(code, (200, 201))
        return task_id, commit, patch_path

    def test_17_a7_real_process_restart_event_idempotent(self):
        """A7 真实现场（P2-02）：子进程提交 GIT_VALIDATE 后 os._exit（M1 已提交、客户端
        进程死）→ 全新子进程 resume → 只读核实接续 → task_events 同 event_id 恰 1 条。"""
        self._runner_reply = None
        task_id, commit, patch_path = self._make_runner_leg("rn17")
        run_key = "997017"
        token = self.tokens["ENGINE-01"]
        # runner1：R0+R1 的 GIT_VALIDATE 提交后立即 os._exit（响应已达但客户端死亡）
        body1 = (
            "from review_leg import ReviewLeg\n"
            f"leg = ReviewLeg(run_key={run_key!r}, task_id={task_id!r}, project_id='PRJ-RVLTEST',\n"
            f"    reviewed_commit={commit!r}, diff_artifact_id=None,\n"
            f"    diff_file=Path({str(patch_path)!r}), fixture_repo=Path(r'{self.fixture}'),\n"
            f"    m1_url=sys.argv[1], token=sys.argv[2],\n"
            f"    marker_text='[GPT03-R1|{run_key}|{task_id}]')\n"
            "leg.diff_artifact_id = 'ART-DUMMY-NOACCESS'\n"
            "leg.r0_precheck()\n"
            "# A7 注入：GIT_VALIDATE 请求发出后、客户端处理响应前进程死亡\n"
            "orig_post = leg.engine.post\n"
            "def post_die(path, body, timeout=60.0):\n"
            "    r = orig_post(path, body, timeout)\n"
            "    if path.endswith('/events') and body.get('event') == 'GIT_VALIDATE':\n"
            "        os._exit(9)  # M1 已提交（事务内），客户端未处理响应即死\n"
            "    return r\n"
            "leg.engine.post = post_die\n"
            "leg.r1_git_validate_and_pass()\n"
            "print('RUNNER1_UNEXPECTED_COMPLETION')\n"
        )
        r1 = self._write_runner("runner-a7-run.py", body1, token, task_id, commit, patch_path, run_key)
        proc1 = self._run_runner(r1, token, task_id, commit, patch_path, run_key)
        self.assertEqual(proc1.returncode, 9, f"runner1 should die at A7 injection: {proc1.stdout[-400:]} {proc1.stderr[-200:]}")
        # runner2（全新进程）：resume 只读核实接续
        body2 = (
            "from review_leg import ReviewLeg\n"
            f"leg = ReviewLeg(run_key={run_key!r}, task_id={task_id!r}, project_id='PRJ-RVLTEST',\n"
            f"    reviewed_commit={commit!r}, diff_artifact_id=None,\n"
            f"    diff_file=Path({str(patch_path)!r}), fixture_repo=Path(r'{self.fixture}'),\n"
            f"    m1_url=sys.argv[1], token=sys.argv[2],\n"
            f"    marker_text='[GPT03-R1|{run_key}|{task_id}]')\n"
            "leg.diff_artifact_id = 'ART-DUMMY-NOACCESS'\n"
            "rc = leg.resume()\n"
            "print('RUNNER2_RC=', rc)\n"
            "assert rc == 0, f'resume failed: {rc}'\n"
        )
        r2 = self._write_runner("runner-a7-resume.py", body2, token, task_id, commit, patch_path, run_key)
        proc2 = self._run_runner(r2, token, task_id, commit, patch_path, run_key)
        self.assertIn("RUNNER2_RC= 0", proc2.stdout, f"resume runner failed: {proc2.stdout[-400:]} {proc2.stderr[-300:]}")
        ev_id = f"EVT-RVL-{run_key}-GIT_VALIDATE-01"
        rows = self.server.query("SELECT COUNT(*) c FROM task_events WHERE task_id=? AND event_id=?", (task_id, ev_id))
        self.assertEqual(rows[0]["c"], 1, "A7: same event_id exactly once after real process restart")
        self.assertEqual(self.server.query("SELECT status FROM tasks WHERE task_id=?", (task_id,))[0]["status"],
                         "TEST_ACCEPTANCE")

    def test_18_a5b_real_process_restart_register_only(self):
        """A5② 真实现场（P2-03）：子进程完成采集（reply 落盘+R4 账本）后 os._exit（登记
        未完成）→ 全新子进程 resume → 仅补登记（零重派）→ 推进。"""
        commit_reply_holder = {}
        self._runner_reply = None
        task_id, commit, patch_path = self._make_runner_leg("rn18")
        self._runner_reply = self.reply_for(commit, "PASS")
        run_key = "997018"
        token = self.tokens["ENGINE-01"]
        body1 = (
            "from review_leg import ReviewLeg\n"
            f"leg = ReviewLeg(run_key={run_key!r}, task_id={task_id!r}, project_id='PRJ-RVLTEST',\n"
            f"    reviewed_commit={commit!r}, diff_artifact_id=None,\n"
            f"    diff_file=Path({str(patch_path)!r}), fixture_repo=Path(r'{self.fixture}'),\n"
            f"    m1_url=sys.argv[1], token=sys.argv[2],\n"
            f"    marker_text='[GPT03-R1|{run_key}|{task_id}]')\n"
            "leg.diff_artifact_id = 'ART-DUMMY-NOACCESS'\n"
            "leg.r0_precheck()\n"
            "leg.r1_git_validate_and_pass()\n"
            "task = leg._refetch_task()\n"
            "leg.r2_compose_brief(task)\n"
            "ddir = leg.r3_dispatch(leg.run_dir.joinpath('brief.txt').read_text(encoding='utf-8'))\n"
            "leg.r4_capture_and_validate(ddir, batch_id=task.get('batch_id'))\n"
            "os._exit(9)  # A5② 断点：已采集未登记，进程终止（现场不落终态）\n"
        )
        r1 = self._write_runner("runner-a5b-run.py", body1, token, task_id, commit, patch_path, run_key)
        proc1 = self._run_runner(r1, token, task_id, commit, patch_path, run_key)
        self.assertEqual(proc1.returncode, 9, f"runner1 should die at A5② breakpoint: {proc1.stdout[-300:]} {proc1.stderr[-200:]}")
        body2 = (
            "from review_leg import ReviewLeg\n"
            f"leg = ReviewLeg(run_key={run_key!r}, task_id={task_id!r}, project_id='PRJ-RVLTEST',\n"
            f"    reviewed_commit={commit!r}, diff_artifact_id=None,\n"
            f"    diff_file=Path({str(patch_path)!r}), fixture_repo=Path(r'{self.fixture}'),\n"
            f"    m1_url=sys.argv[1], token=sys.argv[2],\n"
            f"    marker_text='[GPT03-R1|{run_key}|{task_id}]')\n"
            "leg.diff_artifact_id = 'ART-DUMMY-NOACCESS'\n"
            "rc = leg.resume()\n"
            "print('RUNNER2_RC=', rc)\n"
            "assert rc == 0, f'resume failed: {rc}'\n"
        )
        r2 = self._write_runner("runner-a5b-resume.py", body2, token, task_id, commit, patch_path, run_key)
        proc2 = self._run_runner(r2, token, task_id, commit, patch_path, run_key)
        self.assertIn("RUNNER2_RC= 0", proc2.stdout, f"resume runner failed: {proc2.stdout[-400:]} {proc2.stderr[-300:]}")
        reports = self.server.query("SELECT COUNT(*) c FROM review_reports WHERE task_id=?", (task_id,))
        self.assertEqual(reports[0]["c"], 1)
        msgs = self.server.query("SELECT COUNT(*) c FROM messages WHERE task_id=? AND message_type='CODE_REVIEW_SUBMITTED'", (task_id,))
        self.assertEqual(msgs[0]["c"], 1)
        dispatch_dirs = list(rl.DISPATCH_LOG_DIR.glob("dispatch-runner-*"))
        self.assertLessEqual(len(dispatch_dirs), 1, "A5②: no re-dispatch across process restart")
        self.assertEqual(self.server.query("SELECT status FROM tasks WHERE task_id=?", (task_id,))[0]["status"],
                         "TEST_ACCEPTANCE")

    def test_16c_confirmed_send_missing_key_fails_closed_even_attach(self):'''
assert OLD_ANCHOR in s, "test_16c anchor not found"
s = s.replace(OLD_ANCHOR, NEW_BLOCK, 1)

# runner helper 注入到类内（放在 _write_runner 定义处）
HELPER_ANCHOR = '''    @staticmethod
    def reply_for(commit: str, result: str = "PASS", extra: str = "") -> str:'''
assert HELPER_ANCHOR in s, "helper anchor not found"
s = s.replace(HELPER_ANCHOR, RUNNER_HELPER + "\n" + HELPER_ANCHOR, 1)

open(p, "w", encoding="utf-8", newline="\n").write(s)
print("test_17/18 (real process restart) added")
