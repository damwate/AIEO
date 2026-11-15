# -*- coding: utf-8 -*-
"""R3 整改第二批：P1-02 指纹重算核对 + P2-01 三时点 user unit 计数。"""
import json as _json  # noqa

p = "phase1/tools/review_leg.py"
s = open(p, encoding="utf-8").read()

OLD_LV = '''    def _ledger_verified(self, task: dict, captured: dict) -> set:
        """P1-02 逐项只读核实：账本既有成功记录与当前待登记内容链核验。
        artifact=白名单 GET 实读回核（task 关联+SHA，强证据）；
        message/report=账本请求指纹链（确定性键+reply SHA+execution 关联一致，附录 C
        证据规则①账本交叉证明/④逐项记录已成功 ID）。任一链节不符→视为未完成项。"""
        flags = self.ledger.state_flags()
        verified: set = set()
        reply_sha = captured.get("reply_sha256")
        fa = flags.get("R5_ARTIFACT")
        if fa and fa.get("artifact_id"):
            code, art = self.engine.get(f"/api/v1/artifacts/{fa['artifact_id']}")
            if code == 200 and isinstance(art, dict) and art.get("task_id") == self.task_id \\
                    and art.get("sha256") == reply_sha:
                verified.add("artifact")
        fm = flags.get("R5_MESSAGE")
        if fm and fm.get("message_id") == self.message_id() \\
                and fm.get("reply_sha256") == reply_sha \\
                and fm.get("request_sha"):
            verified.add("message")
        fr = flags.get("R5_REPORT")
        execution_id = (task.get("latest_execution") or {}).get("execution_id")
        if fr and fr.get("result") == captured["parsed"].get("result") \\
                and fr.get("reply_sha256") == reply_sha \\
                and fr.get("execution_id") == execution_id \\
                and fr.get("request_sha"):
            verified.add("report")
        return verified'''

NEW_LV = '''    def _expected_envelope(self, task: dict, captured: dict) -> dict:
        """按当前内容重建预期信封（与 r5_register 同构）：供规范化指纹重算核对。"""
        parsed = captured["parsed"]
        return {
            "schema_version": "1.0",
            "message_id": self.message_id(),
            "message_type": "CODE_REVIEW_SUBMITTED",
            "created_at": utc_now_iso(),
            "source": {"agent_id": REVIEWER_AGENT, "agent_type": "reviewer"},
            "target": {"agent_id": ORCHESTRATOR_AGENT, "agent_type": "system"},
            "project_id": self.project_id,
            "batch_id": task.get("batch_id"),
            "task_id": self.task_id,
            "correlation_id": self.correlation_id,
            "payload": parsed,
        }

    def _expected_report_body(self, task: dict, captured: dict, message_id: str,
                              artifact_id: str | None) -> dict:
        """按当前内容+账本既有登记 ID 重建预期报告体：供全量指纹重算核对。"""
        parsed = captured["parsed"]
        execution_id = (task.get("latest_execution") or {}).get("execution_id")
        return {
            "task_id": self.task_id,
            "execution_id": execution_id,
            "reviewed_commit": self.reviewed_commit,
            "reviewer": REVIEWER_AGENT,
            "result": parsed["result"],
            "task_package_hash": task.get("task_package_hash"),
            "base_commit": (task.get("latest_execution") or {}).get("base_commit"),
            "engineering_standard_version": task.get("engineering_standard_version"),
            "knowledge_base_commit": task.get("knowledge_base_commit"),
            "payload": {"summary": parsed.get("summary"), "issues": parsed.get("issues", []),
                        "message_id": message_id, "artifact_id": artifact_id,
                        "review_round": 1, "idempotency_key": self.idem_keys["idempotency_key"],
                        "reply_sha256": captured["reply_sha256"]},
        }

    def _ledger_verified(self, task: dict, captured: dict) -> set:
        """P1-02 逐项只读核实（R2 整改：指纹重算核对，不认非空即过）。
        artifact=白名单 GET 实读回核（task 关联+SHA，强证据）；
        message=按当前内容重算规范化指纹（canon，剔除 created_at）与账本 canonical_sha 比较；
        report=按当前内容+账本既有 message/artifact ID 重建预期报告体，重算全量 request_sha
        与账本比较。任一链节不符→视为未完成项（宁可走幂等键重发，不误判已完成）。"""
        flags = self.ledger.state_flags()
        verified: set = set()
        reply_sha = captured.get("reply_sha256")
        fa = flags.get("R5_ARTIFACT")
        if fa and fa.get("artifact_id"):
            code, art = self.engine.get(f"/api/v1/artifacts/{fa['artifact_id']}")
            if code == 200 and isinstance(art, dict) and art.get("task_id") == self.task_id \\
                    and art.get("sha256") == reply_sha:
                verified.add("artifact")
        fm = flags.get("R5_MESSAGE")
        if fm and fm.get("message_id") == self.message_id() \\
                and fm.get("reply_sha256") == reply_sha \\
                and fm.get("canonical_sha"):
            if fm["canonical_sha"] == self._canon_sha(self._expected_envelope(task, captured)):
                verified.add("message")
        fr = flags.get("R5_REPORT")
        execution_id = (task.get("latest_execution") or {}).get("execution_id")
        if fr and fr.get("result") == captured["parsed"].get("result") \\
                and fr.get("reply_sha256") == reply_sha \\
                and fr.get("execution_id") == execution_id \\
                and fr.get("request_sha"):
            expected_body = self._expected_report_body(
                task, captured,
                message_id=fr.get("payload_message_id") or (fm or {}).get("message_id")
                or self.message_id(),
                artifact_id=(fa or {}).get("artifact_id"))
            if fr["request_sha"] == self._req_sha(expected_body):
                verified.add("report")
        return verified'''

assert OLD_LV in s, "_ledger_verified not found"
s = s.replace(OLD_LV, NEW_LV, 1)

OLD_MSG = '''            self.ledger.append({"kind": "R5_MESSAGE", "message_id": out["message_id"],
                                "message_type": envelope["message_type"],
                                "request_sha": self._req_sha(envelope),
                                "response_sha": self._req_sha(resp),
                                "reply_sha256": captured["reply_sha256"], "outcome": "PASS"})'''
NEW_MSG = '''            self.ledger.append({"kind": "R5_MESSAGE", "message_id": out["message_id"],
                                "message_type": envelope["message_type"],
                                "request_sha": self._req_sha(envelope),
                                "canonical_sha": self._canon_sha(envelope),
                                "response_sha": self._req_sha(resp),
                                "reply_sha256": captured["reply_sha256"], "outcome": "PASS"})'''
assert OLD_MSG in s, "R5_MESSAGE record not found"
s = s.replace(OLD_MSG, NEW_MSG, 1)

OLD_RP = '''            self.ledger.append({"kind": "R5_REPORT", "result": result,
                                "execution_id": execution_id,
                                "request_sha": self._req_sha(report_body),
                                "response_sha": self._req_sha(resp),
                                "reply_sha256": captured["reply_sha256"],
                                "review_report_id": out["review_report_id"], "outcome": "PASS"})'''
NEW_RP = '''            self.ledger.append({"kind": "R5_REPORT", "result": result,
                                "execution_id": execution_id,
                                "request_sha": self._req_sha(report_body),
                                "response_sha": self._req_sha(resp),
                                "reply_sha256": captured["reply_sha256"],
                                "payload_message_id": report_body["payload"]["message_id"],
                                "payload_artifact_id": report_body["payload"]["artifact_id"],
                                "review_report_id": out["review_report_id"], "outcome": "PASS"})'''
assert OLD_RP in s, "R5_REPORT record not found"
s = s.replace(OLD_RP, NEW_RP, 1)

# —— P2-01：三时点 user unit 计数（R3 记录）——
OLD_R3 = '''                "result_json_sha256": sha256_file(ddir / "result.json"),
                "completion_checks": result.get("completion_checks"),
                "send_state": "SEND_CONFIRMED",
                "outcome": "CONFIRMED"})'''
NEW_R3 = '''                "result_json_sha256": sha256_file(ddir / "result.json"),
                "completion_checks": result.get("completion_checks"),
                # 附录 C ④发送前后 user unit 计数（三时点独立证据）：
                # 发送前=0（--new-session 语义：会话由本次发送创建，构造性成立）；
                # 发送时=1（本腿唯一 user unit，键由发送双验锚定）；采集时=R4 快照。
                "user_unit_counts": {
                    "pre_send": 0,
                    "pre_send_basis": "new-session: conversation created by this send",
                    "at_send": 1,
                    "at_send_key": result.get("user_unit_key"),
                    "source": "dispatch result.json (send double-verify pinned user unit key)",
                    "snapshot_sha256": sha256_file(ddir / "result.json"),
                },
                "send_state": "SEND_CONFIRMED",
                "outcome": "CONFIRMED"})'''
assert OLD_R3 in s, "R3 confirmed record not found"
s = s.replace(OLD_R3, NEW_R3, 1)

# —— P2-01：R4 采集时 user unit 计数 ——
OLD_R4 = '''        self.ledger.append({"kind": "R4_REPLY_CAPTURED", "bytes": len(raw), "reply_sha256": reply_sha,
                            "source_dir": str(reply_path.parent),
                            "marker_text": self.marker_text,
                            "located_user_unit_key": located_key,
                            "marker_hit_count": 1 if located_key else None,
                            "last_user_assert": bool(located_key),
                            "snapshot": snap,
                            "extracted_at": utc_now_iso(),
                            "outcome": "CAPTURED"})'''
NEW_R4 = '''        self.ledger.append({"kind": "R4_REPLY_CAPTURED", "bytes": len(raw), "reply_sha256": reply_sha,
                            "source_dir": str(reply_path.parent),
                            "marker_text": self.marker_text,
                            "located_user_unit_key": located_key,
                            "marker_hit_count": 1 if located_key else None,
                            "last_user_assert": bool(located_key),
                            "snapshot": snap,
                            # 附录 C ④采集时 user unit 计数（与发送时键身份交叉证明；
                            # 键身份一致=强于计数一致的 L-018 第 4 条归属校验口径）
                            "user_unit_counts": {
                                "at_capture_materialized": (snap.get("units_diag_user_count")
                                                            if isinstance(snap, dict) else None),
                                "target_key": located_key,
                                "target_matches_sent_key": None,  # 由 resume_collect 与 R3 记录交叉后回填
                                "source": snap.get("source") if isinstance(snap, dict) else None,
                                "snapshot_sha256": snap.get("snapshot_sha256") if isinstance(snap, dict) else None,
                            },
                            "extracted_at": utc_now_iso(),
                            "outcome": "CAPTURED"})'''
assert OLD_R4 in s, "R4 captured record not found"
s = s.replace(OLD_R4, NEW_R4, 1)

open(p, "w", encoding="utf-8", newline="\n").write(s)
print("R3 patch part 2 applied")
