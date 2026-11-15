# -*- coding: utf-8 -*-
"""R3 测试整改：NEW-P1-01 完整恢复链测试（08c）+ message成功/report失败恢复（09b）+ 双扩展。"""
import json as _json  # noqa

P = "phase1/tools/test_review_leg.py"
s = open(P, encoding="utf-8").read()

# 1) make_dispatch_double：识别 recoll_driver 调用（补采驱动=ChatGPT 采集边界替身）
OLD_DD = '''    def wrapper(cmd, **kw):
        joined = " ".join(map(str, cmd))
        if "gpt_dispatch.mjs" not in joined:
            return REAL_SUBPROCESS_RUN(cmd, **kw)'''
NEW_DD = '''    def wrapper(cmd, **kw):
        joined = " ".join(map(str, cmd))
        if "recoll_driver.mjs" in joined:
            # 补采驱动拦截（ChatGPT 采集边界替身的一部分）：落盘 recoll 产物
            calls["recoll"] = calls.get("recoll", 0) + 1
            out_dir = Path(str(kw.get("cwd"))) if False else None
            # 驱动模板内 OUT_DIR 为绝对路径 token——替身直接写 run_dir（由测试闭包提供）
            if recoll_sink is not None:
                recoll_sink["n"] = calls["recoll"]
            return REAL_SUBPROCESS_RUN(cmd, **kw) if recoll_sink is None else FakeProc(0)
        if "gpt_dispatch.mjs" not in joined:
            return REAL_SUBPROCESS_RUN(cmd, **kw)'''
assert OLD_DD in s, "double wrapper head not found"
s = s.replace(OLD_DD, NEW_DD, 1)

OLD_SIG = '''def make_dispatch_double(review_reply: str, dispatch_root: Path, fail_first: bool = False):'''
NEW_SIG = '''def make_dispatch_double(review_reply: str, dispatch_root: Path, fail_first: bool = False,
                         recoll_sink: dict | None = None):'''
assert OLD_SIG in s, "double signature not found"
s = s.replace(OLD_SIG, NEW_SIG, 1)

# 2) test_08c：COLLECT_FAILED → 原会话补采 → 契约校验 → 补登记 → 状态推进（NEW-P1-01 修复验证）
OLD_ANCHOR = '''    def test_08b_ledger_m1_contradiction_blocks(self):'''
NEW_ANCHOR = '''    def test_08c_collect_failed_full_recovery(self):
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
                (ddir / "result.json").write_text(_json.dumps({
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
                (leg.run_dir / "recoll-result.json").write_text(_json.dumps({
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
                (leg.run_dir / "units-diag.json").write_text(_json.dumps([
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
        self.assertTrue(r4["snapshot"]["source"].startswith("recoll"))

    def test_08b_ledger_m1_contradiction_blocks(self):'''
assert OLD_ANCHOR in s, "test_08b anchor not found"
s = s.replace(OLD_ANCHOR, NEW_ANCHOR, 1)

# 3) test_09b：message 成功、report 失败 → resume 只补 report（P1-02 补充分支）
OLD_T9B = '''    # ------------------------------------------------------------------
    # R0 交叉核验与 Git 校验真实性
    # ------------------------------------------------------------------'''
NEW_T9B = '''    def test_09b_message_ok_report_fail_resume_completes(self):
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
    # ------------------------------------------------------------------'''
assert OLD_T9B in s, "test_09b anchor not found"
s = s.replace(OLD_T9B, NEW_T9B, 1)

open(P, "w", encoding="utf-8", newline="\n").write(s)
print("R3 test patches applied")
