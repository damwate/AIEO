import json
from concurrent.futures import ThreadPoolExecutor
from hashlib import sha256
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from playwright_queue import INSTANCE, Queue, QueueError, checked_recollection, dispatch, run_once


A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"


class QueueTest(unittest.TestCase):
    def setUp(self):
        self.root = Path(self.enterContext(TemporaryDirectory()))
        self.queue = Queue(self.root / "state")
        self.logs = self.root / "logs"

    def submit(self, task="a", lane="code-review", round_id="r1", **kwargs):
        return self.queue.submit(task, lane, round_id, "Please review the pinned commit.", **kwargs)

    def fake_adapter(self, session, target=None, *, exit_code=0, reply=b"ok"):
        def adapter(job, folder):
            self.assertEqual(job["target_session"], target)
            name = f"dispatch-test-{job['seq']}"
            archive = self.logs / name
            archive.mkdir(parents=True)
            receipt = {"state": "SEND_CONFIRMED", "dispatch_dir": name,
                       "session_id": session, "user_unit_key": "turn-1"}
            (folder / "send-receipt.json").write_text(json.dumps(receipt), encoding="utf-8")
            (archive / "request.txt").write_bytes(job["brief"].encode())
            if exit_code == 0:
                (archive / "reply.txt").write_bytes(reply)
                result = {"instance_id": INSTANCE, "artifact_sha256": sha256(reply).hexdigest(), "size_bytes": len(reply),
                          "completion_checks": {"passed": True}, "session_id": session,
                          "conversation_url": f"https://chatgpt.com/c/{session}", "user_unit_key": "turn-1"}
                (archive / "result.json").write_text(json.dumps(result), encoding="utf-8")
            return exit_code
        return adapter

    def test_fifo_session_isolation_and_task_reuse(self):
        rows = [self.submit("a"), self.submit("b"), self.submit("a", round_id="r2")]
        for row, adapter in zip(rows, [self.fake_adapter(A), self.fake_adapter(B), self.fake_adapter(A, A)]):
            result = run_once(self.queue, adapter, self.logs)
            self.assertEqual(result["seq"], row["seq"])
            self.assertEqual(result["state"], "COMPLETED")
        self.assertIsNone(run_once(self.queue, log_dir=self.logs))

    def test_rejects_cross_lane_and_late_wrong_session(self):
        self.submit()
        run_once(self.queue, self.fake_adapter(A), self.logs)
        self.submit(lane="test-acceptance")
        result = run_once(self.queue, self.fake_adapter(A), self.logs)
        self.assertEqual(result["state"], "BLOCKED")
        self.submit("b")
        self.assertIsNone(self.queue.claim())

    def test_duplicate_and_concurrent_claims(self):
        first = self.submit()
        self.assertEqual(first["seq"], self.submit()["seq"])
        with self.assertRaises(QueueError):
            self.queue.submit("a", "code-review", "r1", "Different message.")
        self.submit("b")
        with ThreadPoolExecutor(2) as executor:
            jobs = list(executor.map(lambda _: Queue(self.queue.directory).claim(), range(2)))
        self.assertEqual([first["seq"]], [job["seq"] for job in jobs if job])
        self.assertIsNone(Queue(self.queue.directory).claim())

    def test_uncertain_blocks_fifo_and_recollection_resumes_original(self):
        first = self.submit()
        second = self.submit("b")
        self.assertEqual(run_once(self.queue, self.fake_adapter(A, exit_code=1), self.logs)["state"], "BLOCKED")
        queue = Queue(self.queue.directory)
        self.assertIsNone(queue.claim())
        job = queue.get(first["seq"])
        recovered = self.root / "recovered"
        recovered.mkdir()
        reply = b"verified reply"
        (recovered / "reply.txt").write_bytes(reply)
        marker = job["brief"].splitlines()[0]
        units = [{"role": "user", "key": "collected-1", "text_head": marker}]
        (recovered / "units-diag.json").write_text(json.dumps(units), encoding="utf-8")
        result = {
            "recollection": True,
            "reference_failed_dispatch_dir": str(self.logs / "dispatch-test-1"),
            "sent_user_unit_key_reported": "turn-1", "located_user_unit_key": "collected-1",
            "conversation_url": f"https://chatgpt.com/c/{A}",
            "reply_sha256": sha256(reply).hexdigest(), "reply_bytes": len(reply),
            "checks": dict.fromkeys(("final_stop_button_not_visible", "tail_is_assistant",
                                    "dil_uuid_present", "uuid_stable", "stable_unit_read",
                                    "target_range_materialized", "not_prev_reply_sha"), True),
        }
        report_path = recovered / "recoll-result.json"
        report_path.write_text(json.dumps({**result, "conversation_url": f"https://chatgpt.com/c/{B}"}))
        folder = queue.directory / "jobs" / str(first["seq"])
        with self.assertRaises(QueueError):
            checked_recollection(queue, folder, self.logs, job, recovered)
        report_path.write_text(json.dumps(result))
        evidence = checked_recollection(queue, folder, self.logs, job, recovered)
        queue.finish(first["seq"], "COMPLETED", evidence)
        self.assertEqual(run_once(queue, self.fake_adapter(B), self.logs)["seq"], second["seq"])

    def test_explicit_lane_rotation_keeps_historical_ownership(self):
        self.submit()
        run_once(self.queue, self.fake_adapter(A), self.logs)
        self.submit(round_id="r2", new_session=True)
        run_once(self.queue, self.fake_adapter(B), self.logs)
        self.submit(round_id="r3")
        self.assertEqual(run_once(self.queue, self.fake_adapter(B, B), self.logs)["state"], "COMPLETED")
        self.submit("b")
        self.assertEqual(run_once(self.queue, self.fake_adapter(A), self.logs)["state"], "BLOCKED")

    def test_worker_never_uses_the_shared_session_pointer(self):
        folder = self.root / "flags"
        folder.mkdir()
        job = {"brief": "queued message", "target_session": A, "target_url": f"https://chatgpt.com/c/{A}"}
        with patch("playwright_queue.subprocess.run") as process:
            self.assertEqual(dispatch(job, folder), process.return_value.returncode)
        argv = process.call_args.args[0]
        self.assertIn("--no-update-pointer", argv)
        self.assertEqual(argv[argv.index("--instance") + 1], INSTANCE)
        self.assertEqual(argv[argv.index("--session-result") + 1], str(folder / "session.json"))
        self.assertNotIn("--new-session", argv)
        self.assertEqual(json.loads((folder / "session.json").read_text())["session_id"], A)

    def test_only_confirmed_pre_send_failure_can_release_channel(self):
        first = self.submit()
        second = self.submit("b")

        def preflight_failure(job, folder):
            (folder / "send-receipt.json").write_text(
                json.dumps({"state": "NOT_SENT", "dispatch_dir": "dispatch-preflight"}), encoding="utf-8"
            )
            return 1

        result = run_once(self.queue, preflight_failure, self.logs)
        self.assertEqual((result["seq"], result["state"]), (first["seq"], "NOT_SENT"))
        self.assertEqual(run_once(self.queue, self.fake_adapter(B), self.logs)["seq"], second["seq"])


if __name__ == "__main__":
    unittest.main()
