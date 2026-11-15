# -*- coding: utf-8 -*-
"""S1-R1 整改：test_08 拆分（P2-03）+ test_09 服务端注入（P2-02）+ test_13b 适配。"""
import json as _json  # noqa

P = "phase1/tools/test_review_leg.py"
s = open(P, encoding="utf-8").read()

old08 = '''    def test_08_ledger_broken_intent_without_confirm_blocks(self):
        leg, task_id, _, ctx, commit = self.make_leg("f06", lambda c: self.reply_for(c, "PASS"),
                                                     fail_first_send=False)
        leg.ledger.append({"kind": "R3_SEND_INTENT_RECORDED", "attempt": 1, "outcome": "INTENT"})
        wrapper, calls = make_dispatch_double(self.reply_for(commit, "PASS"), rl.DISPATCH_LOG_DIR)
        with self.dispatch_double(wrapper):
            with self.assertRaises(OrchestrationError) as cm:
                leg.resume()
        self.assertTrue("cannot prove send state" in str(cm.exception)
                        or "contradiction" in str(cm.exception),
                        f"unexpected fail-closed reason: {cm.exception}")
        self.assertEqual(calls["n"], 0, "must not redispatch on broken ledger (A8)")
        task = self.server.query("SELECT status FROM tasks WHERE task_id=?", (task_id,))
        self.assertEqual(task[0]["status"], "DEV_REPORTED")'''

new08 = '''    def test_08a_send_happened_ledger_broken_blocks(self):
        """A8 场景①（charter 附录 D A8）：发送已成立、发送后账本记录丢失（仅剩 INTENT）
        → resume 禁重发+腿级 BLOCKED+M1 状态不动；账本修复后续跑只补登记零发送。"""
        leg, task_id, _, ctx, commit = self.make_leg("f06a", lambda c: self.reply_for(c, "PASS"))
        wrapper, calls = ctx
        leg.r0_precheck()
        leg.r1_git_validate_and_pass()
        task = leg._refetch_task()
        leg.r2_compose_brief(task)
        with self.dispatch_double(wrapper):
            leg.r3_dispatch(leg.run_dir.joinpath("brief.txt").read_text(encoding="utf-8"))
        self.assertEqual(calls["n"], 1)
        recs = leg.ledger.load()
        cut = next(i for i, r in enumerate(recs) if r["kind"] == "R3_SEND_INTENT_RECORDED")
        kept = recs[:cut + 1]
        leg.ledger.path.write_text(
            "".join(_json.dumps(r, ensure_ascii=False) + "\\n" for r in kept), encoding="utf-8")
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
            "".join(_json.dumps(r, ensure_ascii=False) + "\\n" for r in recs), encoding="utf-8")
        rc2 = leg.resume()
        self.assertEqual(rc2, 0, "restored ledger completes registration without new send")
        self.assertEqual(calls2["n"], 0, "recovery registration must not send")
        self.assertEqual(self.server.query(
            "SELECT status FROM tasks WHERE task_id=?", (task_id,))[0]["status"], "TEST_ACCEPTANCE")

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
            "SELECT status FROM tasks WHERE task_id=?", (task_id,))[0]["status"], "DEV_REPORTED")'''

assert old08 in s, "test_08 block not found"
s = s.replace(old08, new08, 1)

old09 = '''    def test_09_partial_registration_resumes_without_redo(self):
        leg, task_id, _, ctx, commit = self.make_leg("f07", lambda c: self.reply_for(c, "PASS"))
        wrapper, _ = ctx
        task = None
        with self.dispatch_double(wrapper):
            # 注入：messages 登记时中断（artifact 已成功）：包装 engine.post
            real_client_post = leg.engine.post
            def broken_post(path, body, timeout=60.0):
                if path == "/api/v1/messages":
                    raise OrchestrationError(5, "injected partial-failure after artifact (test)")
                return real_client_post(path, body, timeout)
            leg.engine.post = broken_post
            rc = leg.run()
            leg.engine.post = real_client_post
            self.assertEqual(rc, 2, "partial failure -> leg-level BLOCKED")'''

new09 = '''    def test_09_partial_registration_resumes_without_redo(self):
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
        self.assertEqual(rc, 2, "server-side messages failure -> leg-level BLOCKED")'''

assert old09 in s, "test_09 head not found"
s = s.replace(old09, new09, 1)

old09b = '''            arts = self.server.query("SELECT artifact_id,sha256 FROM artifacts WHERE task_id=? AND type='REVIEW_EVIDENCE'", (task_id,))
            self.assertEqual(len(arts), 1, "artifact persisted through partial failure")
            artifact_id_before = arts[0]["artifact_id"]
            # 续跑：账本 R4 已捕获 → resume 走补登记路径（不重新派单）
            wrapper2, calls2 = make_dispatch_double("should-not-be-sent", rl.DISPATCH_LOG_DIR)
            with self.dispatch_double(wrapper2):
                rc2 = leg.resume()
            self.assertEqual(rc2, 0)
            self.assertEqual(calls2["n"], 0, "resume register must not re-dispatch")
            arts = self.server.query("SELECT artifact_id,sha256 FROM artifacts WHERE task_id=? AND type='REVIEW_EVIDENCE'", (task_id,))
            self.assertEqual(len(arts), 1)
            self.assertEqual(arts[0]["artifact_id"], artifact_id_before, "artifact id/content unchanged")
            task = self.server.query("SELECT status FROM tasks WHERE task_id=?", (task_id,))
            self.assertEqual(task[0]["status"], "TEST_ACCEPTANCE")'''

new09b = '''        arts = self.server.query("SELECT artifact_id,sha256 FROM artifacts WHERE task_id=? AND type='REVIEW_EVIDENCE'", (task_id,))
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
            "SELECT status FROM tasks WHERE task_id=?", (task_id,))[0]["status"], "TEST_ACCEPTANCE")'''

assert old09b in s, "test_09 tail not found"
s = s.replace(old09b, new09b, 1)

old13b = '''        with self.assertRaises(OrchestrationError) as cm:
            leg.resume()
        self.assertIn("OWNER", str(cm.exception))'''

new13b = '''        rc = leg.resume()
        self.assertEqual(rc, 2)
        self.assertIn("OWNER", leg.ledger.latest("LEG_LEVEL_BLOCKED")["reason"])'''

assert old13b in s, "test_13b block not found"
s = s.replace(old13b, new13b, 1)

open(P, "w", encoding="utf-8", newline="\n").write(s)
print("test rework applied")
