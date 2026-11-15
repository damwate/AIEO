# -*- coding: utf-8 -*-
"""S2-R3 整改：test_19（A5① 组合证据——会商裁定乙方案）。
按会商口径：①runner 独立进程在"发送确认后、reply 采集前"（账本状态事件=CONFIRMED 落账、
R4_REPLY_CAPTURED 未落账）os._exit；②父测试双重验证进程树死亡（returncode+tasklist 独立
存活检查）；③全新子进程 resume 走补采→补登记（零重派）；④组合证据不得表述为
"一次真实派单现场完整捕获"（丙修正口径，写入断言注释）。"""
import json as _json

p = "phase1/tools/test_review_leg.py"
s = open(p, encoding="utf-8").read()

# runner 模板增加 recoll_driver 拦截（A5① resume 走补采路径）
OLD_TPL = '''        reply_text = __REPLY__
        (ddir / "reply.txt").write_text(reply_text, encoding="utf-8")'''
NEW_TPL = '''        reply_text = __REPLY__
        (ddir / "reply.txt").write_text(reply_text, encoding="utf-8")
        if "recoll_driver.mjs" in joined:
            # A5① 组合证据（会商乙方案）：补采替身=ChatGPT 采集边界
            import hashlib as _h
            rsha = _h.sha256(reply_text.encode("utf-8")).hexdigest()
            out_dir = Path(r"__OUTDIR__")
            out_dir.mkdir(parents=True, exist_ok=True)
            (out_dir / "reply.txt").write_text(reply_text, encoding="utf-8")
            (out_dir / "recoll-result.json").write_text(json.dumps({
                "recollection": True, "located_user_unit_key": "fallback-turn-0:0:user",
                "unit_count": 1, "reply_bytes": len(reply_text.encode("utf-8")),
                "reply_sha256": rsha, "stability": {"stable": True},
                "checks": {"final_stop_button_not_visible": True, "tail_is_assistant": True,
                           "dil_uuid_present": True, "uuid_stable": True, "stable_unit_read": True,
                           "target_range_materialized": True, "not_prev_reply_sha": True},
                "conversation_url": "https://chatgpt.com/c/33333333-4444-4555-8666-777777777777",
            }, ensure_ascii=False), encoding="utf-8")
        class FP:
            returncode = 0
            stdout = b""
            stderr = b""
        return FP()'''
assert OLD_TPL in s, "tpl anchor not found"
s = s.replace(OLD_TPL, NEW_TPL, 1)
s = s.replace('tpl = tpl.replace("__REPLY__", repr(self._runner_reply or ""))',
              'tpl = tpl.replace("__REPLY__", repr(self._runner_reply or ""))\n'
              '        tpl = tpl.replace("__OUTDIR__", str(self.tmp / "runtime" / "__RUNKEY__"))', 1)

OLD_TESTS = '''    def test_16d_intent_only_attach_fails_closed(self):'''
NEW_TESTS = '''    def test_19_a5_combination_evidence_process_death_verified(self):
        """A5① 组合证据（会商乙方案裁定）：runner 独立进程于"发送确认后、reply 采集前"
        （账本状态事件=CONFIRMED 落账、R4_REPLY_CAPTURED 未落账）os._exit；父测试双重
        验证进程树死亡（returncode+tasklist 独立存活检查）；全新子进程 resume 走补采→
        补登记→推进（零重派）。丙修正口径：组合证据，不得表述为一次真实派单现场完整捕获。"""
        task_id, commit, patch_path, artifact_id = self._make_runner_leg("rn19")
        self._runner_reply = self.reply_for(commit, "PASS")
        run_key = "997019"
        token = self.tokens["ENGINE-01"]
        body1 = (
            "ART_ID = sys.argv[7]\\n"
            "from review_leg import ReviewLeg\\n"
            "leg = ReviewLeg(run_key=" + repr(run_key) + ", task_id=" + repr(task_id) +
            ", project_id='PRJ-RVLTEST',\\n"
            "    reviewed_commit=" + repr(commit) + ", diff_artifact_id=ART_ID,\\n"
            "    diff_file=Path(" + repr(str(patch_path)) + "), fixture_repo=Path(" + repr(str(self.fixture)) + "),\\n"
            "    m1_url=sys.argv[1], token=sys.argv[2],\\n"
            "    marker_text='[GPT03-R1|" + run_key + "|" + task_id + "]')\\n"
            "leg.r0_precheck()\\n"
            "leg.r1_git_validate_and_pass()\\n"
            "task = leg._refetch_task()\\n"
            "leg.r2_compose_brief(task)\\n"
            "leg.r3_dispatch(leg.run_dir.joinpath('brief.txt').read_text(encoding='utf-8'))\\n"
            "# A5① 断点：发送确认已落账（CONFIRMED）、reply 采集动作未执行（R4 未落账）\\n"
            "kinds = [json.loads(l)['kind'] for l in leg.ledger.path.read_text(encoding='utf-8').splitlines() if l.strip()]\\n"
            "assert 'R3_SEND_CONFIRMED' in kinds and 'R4_REPLY_CAPTURED' not in kinds, kinds\\n"
            "print('BREAKPOINT_STATE_OK', flush=True)\\n"
            "os._exit(9)\\n"
        )
        r1 = self._write_runner("runner-a5c-run.py", body1, task_id, commit, patch_path, run_key)
        import time as _t
        t0 = _t.time()
        proc1 = self._run_runner(r1, token, task_id, commit, patch_path, run_key, artifact_id, timeout=180)
        self.assertIn("BREAKPOINT_STATE_OK", proc1.stdout, "breakpoint state must be confirmed before exit")
        self.assertEqual(proc1.returncode, -9 if os.name != "nt" else 9,
                         "runner1 dies after send confirmation, before capture")
        # 双重验证：独立存活检查（tasklist 全量）——进程树死亡证据（会商要求）
        r = subprocess.run(["tasklist", "/FO", "CSV", "/NH"], capture_output=True, text=True, timeout=30)
        self.assertNotIn(str(proc1.pid), r.stdout,
                         "process tree death independently verified via tasklist")
        snap = {"runner_pid": proc1.pid, "exit_code": proc1.returncode,
                "tasklist_verify": "pid absent (independent alive-check)",
                "breakpoint": "R3_SEND_CONFIRMED present / R4_REPLY_CAPTURED absent",
                "combination_evidence_note": "组合证据（会商乙方案）：本测试+918012真实链+test_18恢复语义，"
                                             "不得表述为一次真实派单现场完整捕获",
                "verified_at": _t.strftime("%Y-%m-%dT%H:%M:%S", _t.gmtime()) + "Z"}
        (Path(self.tmp) / "runtime" / "a5-combination-snapshot.json").write_text(
            json.dumps(snap, ensure_ascii=False, indent=2), encoding="utf-8")
        # 全新子进程 resume：CONFIRMED 有/R4 无 → _resume_collect（补采替身）→ 补登记 → 推进
        body2 = (
            "ART_ID = sys.argv[7]\\n"
            "from review_leg import ReviewLeg\\n"
            "leg = ReviewLeg(run_key=" + repr(run_key) + ", task_id=" + repr(task_id) +
            ", project_id='PRJ-RVLTEST',\\n"
            "    reviewed_commit=" + repr(commit) + ", diff_artifact_id=ART_ID,\\n"
            "    diff_file=Path(" + repr(str(patch_path)) + "), fixture_repo=Path(" + repr(str(self.fixture)) + "),\\n"
            "    m1_url=sys.argv[1], token=sys.argv[2],\\n"
            "    marker_text='[GPT03-R1|" + run_key + "|" + task_id + "]')\\n"
            "rc = leg.resume()\\n"
            "print('RUNNER2_RC=' + str(rc))\\n"
            "assert rc == 0, 'resume failed'\\n"
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
        dispatch_dirs = list(rl.DISPATCH_LOG_DIR.glob("dispatch-runner-*"))
        self.assertLessEqual(len(dispatch_dirs), 1, "A5① combination: no re-dispatch")
        self.assertEqual(self.server.query(
            "SELECT status FROM tasks WHERE task_id=?", (task_id,))[0]["status"], "TEST_ACCEPTANCE")

    def test_16d_intent_only_attach_fails_closed(self):'''
assert OLD_TESTS in s, "test_16d anchor not found"
s = s.replace(OLD_TESTS, NEW_TESTS, 1)

open(p, "w", encoding="utf-8", newline="\n").write(s)
print("test_19 injected")
