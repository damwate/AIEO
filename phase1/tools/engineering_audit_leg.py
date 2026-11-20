"""GPT-05 工程总审计真实腿最小版编排（b-20261117-gpt05-engineering-audit-leg；charter v0.9 定稿 DEC-092）。

D2 终裁=同构复制（Gate2 六轮收敛裁定）：以 test_acceptance_leg.py 为主要结构参考，
复用 review_leg.py 公共件（EngineM1Client/ReviewLedger/derive_recoll_driver）与
scheduler.py 件——**不抽新公共 runner、不修改既有三腿任何一行**；M1-M4 代码零修改
（**唯一例外=security.py 约 6 行权限方案**，charter §3/Gate2-R6 授权——本腿不直接
实施该变更，变更随本任务 S2 以独立 commit 落地并带平台回归证据）；M2 派单链零修改复用。

纪律落点（charter v0.9）：
- 附录 A-1 定稿：ENGINE-04 运行期 M1 白名单 8 端点（**无任何状态事件**——批次审计
  不推进批次/任务状态；防御层 event_whitelist=空集）；GET /api/v1/tasks?batch_id=
  依赖 §3 权限方案（服务身份强制 batch_id，缺省 403）。
- 附录 A-2 定稿：结论权威=审计报告 artifact 唯一权威载体；AUDIT_SUBMITTED 批次级
  信封（task_id=null）=登记关联记录；结论域 ACCEPTED/ACCEPTED_WITH_RISKS/BLOCKED；
  standards_matrix 七字段逐项矩阵（C1）+矩阵汇总映射；result×release_recommendation
  一一映射（C3）；message_id 算法冻结（P0-2：run_key SHA-256 折叠，三腿同构）。
- 附录 A-3 定稿：三步独立登记（A4a 简报 artifact→A4b 报告 artifact→A4c message）+
  聚合标志 A4_REGISTERED 三子齐才写；message 409 **五条件 AND**（P0-3）；M1 readback
  →canonical envelope 映射（账本预期骨架+九实质字段读回覆盖+agent_type 账本恢复+
  source_agent_id 一致断言+同一 _canon_sha）。
- §5：C2 批次任务与报告全量分页（total 核对，数量不一致 fail-closed；GET /reports
  无 batch_id 过滤→按批次任务逐项查询）。
- §4 一期边界：显式 CLI 触发一次；结论不自动推进任何 M1 状态；失败→腿级 BLOCKED。
- RunKeyLock 跨进程互斥（三腿同构纪律）。

用法：
  python engineering_audit_leg.py setup-agents --m1-url http://127.0.0.1:8000
      （OWNER 引导：注册 GPT-05 reviewer agent 与 ENGINE-04 服务身份并签发令牌）
  python engineering_audit_leg.py run --run-key 931001 --batch-id BATCH-001
      --project-id PRJ-xxx --input-material-commit <40hex> --material-file <path>
      [--material-file ...] [--m1-url URL] [--token-file path]
      （批次审计轮：简报→真实派单→契约校验→三步留证登记；结论不推进状态）
  python engineering_audit_leg.py resume ...（A-3 矩阵断点恢复）
  python engineering_audit_leg.py attach-reply ... --reply-file <f>
      （人工退路：人工取得审计回复按同一契约+同一幂等键登记）
"""

from __future__ import annotations

import argparse
import contextlib
import hashlib
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from scheduler import M1Client, OrchestrationError, sha256_bytes, sha256_file  # noqa: E402
from review_leg import (  # noqa: E402
    EngineM1Client, ReviewLedger, derive_recoll_driver, utc_now_iso,
    dispatch_receipt_path, read_dispatch_receipt, recover_dispatch_anchor,
    OUTBOUND_LIMIT, REST_TIMEOUT, ORCHESTRATOR_AGENT, PHASE0_TOOLS,
    CONTRACT_DIR, DISPATCH_LOG_DIR,
)

REPO_ROOT = Path(os.environ.get("AIEO_EAL_REPO_ROOT", "D:/AIEO")).resolve()
RUNTIME_DIR = REPO_ROOT / "runtime" / "engineering-audit-leg"
# DEC-097 #1=A：报告契约切 v1.1（统一结构化 findings）；envelope/请求体仍 v1.0 零改
CONTRACT_DIR_V11 = CONTRACT_DIR.parent / "v1.1"
FINDINGS_DEF = CONTRACT_DIR_V11 / "_defs" / "findings.schema.json"
AUDIT_SCHEMA = CONTRACT_DIR_V11 / "engineering-audit-report.schema.json"

REVIEWER_AGENT = "GPT-05"        # 审计角色（envelope source；结论域 ACCEPTED/ACCEPTED_WITH_RISKS/BLOCKED）
ENGINE_AGENT = "ENGINE-04"       # 本机服务身份（提交 Bearer 凭据；C7 §8.6；charter A-1）

# ---------------------------------------------------------------------------
# charter 附录 A-1 定稿：ENGINE-04 运行期 M1 白名单（8 端点；无状态事件——防御层
# event_whitelist=空集；GET /tasks?batch_id= 依赖 §3 权限方案；GET /messages 用
# correlation_id 列表查询（/messages/{id} 服务端未授权）；GET /reports 无 batch_id
# 过滤——按批次任务逐项查询）
# ---------------------------------------------------------------------------
GPT05_WHITELIST = {
    ("GET", "/api/v1/batches/{batch_id}"),
    ("GET", r"/api/v1/tasks\?batch_id={batch_id}(&[A-Za-z_]+=[^/&]*)*"),  # C2 分页参数随行
    ("GET", "/api/v1/tasks/{task_id}"),
    ("GET", "/api/v1/artifacts/{artifact_id}"),
    ("GET", r"/api/v1/reports\?type=test&task_id={task_id}"),
    ("GET", r"/api/v1/messages\?correlation_id={correlation_id}"),
    ("POST", "/api/v1/artifacts"),
    ("POST", "/api/v1/messages"),
}
GPT05_EVENT_WHITELIST: frozenset = frozenset()   # 无状态事件（批次审计不推进状态）
GPT05_EVENT_FORBIDDEN: frozenset = frozenset({
    "PASS", "REWORK", "BLOCKED", "CANCEL", "PLAN", "ARCH_REVIEW", "DISPATCH",
    "START", "DEVELOPMENT_COMPLETED", "GIT_VALIDATE",
})

RESULT_DOMAIN = {"ACCEPTED", "ACCEPTED_WITH_RISKS", "BLOCKED"}
MATRIX_RESULT_DOMAIN = {"PASS", "ISSUE", "BLOCKED"}
RECO_DOMAIN = {"SUBMIT_FOR_APPROVAL", "CONDITIONAL_SUBMIT_WITH_RISKS", "DO_NOT_SUBMIT"}
# charter A-2 定稿：result→release_recommendation 一一映射（C3；矛盾 fail-closed）
RESULT_RECO_MAP = {
    "ACCEPTED": "SUBMIT_FOR_APPROVAL",
    "ACCEPTED_WITH_RISKS": "CONDITIONAL_SUBMIT_WITH_RISKS",
    "BLOCKED": "DO_NOT_SUBMIT",
}
CONTRACT_VERSION = "1.1"  # DEC-097 #1=A：报告契约 v1.1（envelope 的 schema_version 仍 v1.0 独立）
PAGE_SIZE = 200   # C2：分页上限（tasks.py 默认 50/最大 200——全量遍历取上限）


def _canon_sha(obj: dict) -> str:
    """规范化指纹（剔除 created_at 元数据字段）——三腿同构算法（P0-2/P0-3 冻结引用）。"""
    canon = {k: v for k, v in obj.items() if k != "created_at"}
    return sha256_bytes(json.dumps(canon, ensure_ascii=False, sort_keys=True).encode("utf-8"))


def _req_sha(obj) -> str:
    return sha256_bytes(json.dumps(obj, ensure_ascii=False, sort_keys=True).encode("utf-8"))


class RunKeyLock:
    """run_key 跨进程互斥（三腿同构纪律）：OS 级字节锁（Windows=msvcrt.locking
    非阻塞锁首字节；POSIX=fcntl.flock LOCK_NB）——进程退出 OS 自动释放；无法立即
    取得=失败不等待（并发语义 fail-closed）。覆盖 run/resume/attach-reply 全流程。
    注意：不用 os.kill(pid,0) 存活检测——Windows 上等于 TerminateProcess（会误杀）。"""

    def __init__(self, run_dir: Path, holder: str) -> None:
        self.path = run_dir / ".run-key.lock"
        self.holder = holder
        self._fd = None

    def _try_lock(self, fd) -> bool:
        if os.name == "nt":
            import msvcrt
            try:
                msvcrt.locking(fd, msvcrt.LK_NBLCK, 1)
                return True
            except OSError:
                return False
        import fcntl
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            return True
        except OSError:
            return False

    def __enter__(self) -> "RunKeyLock":
        self.path.parent.mkdir(parents=True, exist_ok=True)
        fd = os.open(self.path, os.O_CREAT | os.O_RDWR)
        if not self._try_lock(fd):
            os.close(fd)
            raise OrchestrationError(-1, f"run_key lock held by another live process "
                                         f"(concurrent run/resume/attach on same run_key "
                                         f"forbidden; fail-closed; holder={self.holder})")
        with contextlib.suppress(OSError):
            os.ftruncate(fd, 0)
        os.lseek(fd, 0, os.SEEK_SET)
        os.write(fd, json.dumps({"holder": self.holder, "pid": os.getpid(),
                                 "ts": utc_now_iso()}).encode("utf-8"))
        self._fd = fd
        return self

    def __exit__(self, *exc) -> None:
        if self._fd is not None:
            if os.name == "nt":
                import msvcrt
                with contextlib.suppress(OSError):
                    os.lseek(self._fd, 0, os.SEEK_SET)
                    msvcrt.locking(self._fd, msvcrt.LK_UNLCK, 1)
            else:
                import fcntl
                with contextlib.suppress(OSError):
                    fcntl.flock(self._fd, fcntl.LOCK_UN)
            with contextlib.suppress(OSError):
                os.close(self._fd)
            self._fd = None


class EngineeringAuditLeg:
    """单轮批次工程总审计编排（A0-A5）；账本驱动可恢复；ENGINE-04 白名单内访问 M1。"""

    def __init__(self, run_key: str, batch_id: str, project_id: str,
                 input_material_commit: str, material_files: list[str],
                 m1_url: str, token: str, marker_text: str | None = None,
                 material_base_commit: str | None = None) -> None:
        if not re.fullmatch(r"\d{3,}", run_key):
            raise OrchestrationError(-1, "--run-key must be digits (CORR-<run_key> pattern)")
        if not re.fullmatch(r"BATCH-\d{3,}", batch_id):
            raise OrchestrationError(-1, "--batch-id must match BATCH-<digits>")
        if not re.fullmatch(r"[0-9a-f]{40}", input_material_commit):
            raise OrchestrationError(-1, "--input-material-commit must be full 40-hex SHA")
        if not material_files:
            raise OrchestrationError(-1, "--material-file required (at least one; GitHub 指针模式，"
                                         "固定 commit 禁隐式读最新 main——charter A-2)")
        self.run_key = run_key
        self.batch_id = batch_id
        self.project_id = project_id
        self.input_material_commit = input_material_commit
        self.material_files = list(material_files)
        self.material_base_commit = material_base_commit
        self.marker_text = marker_text or f"[GPT05-AUDIT-R1|{run_key}|{batch_id}]"
        self.engine = EngineM1Client(
            m1_url, token,
            whitelist=GPT05_WHITELIST,
            event_whitelist=GPT05_EVENT_WHITELIST,
            event_forbidden=GPT05_EVENT_FORBIDDEN)
        self.run_dir = RUNTIME_DIR / f"eal-{run_key}"
        self.ledger = ReviewLedger(self.run_dir)
        self.correlation_id = f"CORR-{run_key}"
        self.event_base = f"EVT-EAL-{run_key}"
        self.report_file = self.run_dir / "engineering-audit-leg-report.json"

    # -- 幂等标识（确定性派生；message_id 算法=P0-2 冻结：run_key SHA-256 折叠）--
    def message_id(self) -> str:
        """message_id 冻结算法（charter A-2 P0-2）：h=sha256(run_key)；
        a=h%1e8；b=(h//1e8)%1e6；MSG-{a:08d}-{b:06d}——满足冻结 schema
        ^MSG-\\d{8}-\\d{6}$；同 run_key 重放同 ID；撞键 409 按 A-3 fail-closed。"""
        h = int(hashlib.sha256(self.run_key.encode()).hexdigest(), 16)
        a, b = h % 100_000_000, (h // 100_000_000) % 1_000_000
        return f"MSG-{a:08d}-{b:06d}"

    @property
    def idem_keys(self) -> dict:
        return {
            "run_key": self.run_key,
            "audit_round": 1,
            "idempotency_key": f"{self.run_key}-engineering-audit-round-1",
            "message_id": self.message_id(),
        }

    # ------------------------------------------------------------------
    # 材料清单指纹（charter A-2 绑定字段）
    # ------------------------------------------------------------------
    def material_manifest_sha256(self) -> str:
        """材料版本锚定指纹：固定 commit 下逐文件 git blob SHA 的确定性清单哈希
        （只读 git rev-parse，blob 缺失=fail-closed）。"""
        entries = []
        for rel in sorted(set(self.material_files)):
            p = subprocess.run(["git", "-C", str(REPO_ROOT), "rev-parse",
                                f"{self.input_material_commit}:{rel}"],
                               capture_output=True, timeout=60)
            if p.returncode != 0:
                raise OrchestrationError(-1, f"material file {rel} not in commit "
                                             f"{self.input_material_commit} (fail-closed)")
            entries.append({"path": rel, "blob_sha": p.stdout.decode().strip()})
        return sha256_bytes(json.dumps(entries, sort_keys=True,
                                       ensure_ascii=False).encode("utf-8"))

    # ------------------------------------------------------------------
    # C2 批次任务全景全量分页（total 核对；数量不一致 fail-closed=A11）
    # ------------------------------------------------------------------
    def _fetch_batch_tasks(self) -> list[dict]:
        tasks: list[dict] = []
        page = 1
        total = None
        while True:
            code, resp = self.engine.get(
                f"/api/v1/tasks?batch_id={self.batch_id}&page={page}&page_size={PAGE_SIZE}")
            resp = self._expect(code, (200,), "GET tasks (batch panorama)", resp)
            items = resp.get("items") or []
            total = resp.get("total")
            tasks.extend(items)
            if total is None:
                raise OrchestrationError(0, "GET /tasks response missing total (C2 fail-closed)")
            if len(tasks) >= int(total) or not items:
                break
            page += 1
        if int(total) != len(tasks):
            raise OrchestrationError(0, f"batch tasks total={total} != collected {len(tasks)} "
                                        "(C2 pagination mismatch; fail-closed leg-level BLOCKED)")
        if not tasks:
            raise OrchestrationError(0, f"batch {self.batch_id} has no tasks (审计输入四组之一；fail-closed)")
        return tasks

    # ------------------------------------------------------------------
    # A0 前置只读核查（GET batch + C2 任务全景；不写任何 M1 状态）
    # ------------------------------------------------------------------
    def a0_precheck(self) -> dict:
        code, batch = self.engine.get(f"/api/v1/batches/{self.batch_id}")
        batch = self._expect(code, (200,), "GET batch", batch)
        if not batch.get("requirement"):
            raise OrchestrationError(0, "batch requirement empty (审计输入四组之一；fail-closed)")
        tasks = self._fetch_batch_tasks()
        panorama = [{"task_id": t.get("task_id"), "title": t.get("title"),
                     "status": t.get("status")} for t in tasks]
        status_counts: dict[str, int] = {}
        for t in panorama:
            status_counts[t["status"]] = status_counts.get(t["status"], 0) + 1
        self.ledger.append({"kind": "A0_PRECHECK", "batch": {"batch_id": self.batch_id,
                            "status": batch.get("status"),
                            "engineering_standard_version": batch.get("engineering_standard_version")},
                            "tasks_total": len(panorama),
                            "status_counts": status_counts,
                            "task_ids": [t["task_id"] for t in panorama][:20],
                            "audit_round": 1, "idempotency_key": self.idem_keys["idempotency_key"],
                            "outcome": "PASS"})
        return batch, panorama

    # ------------------------------------------------------------------
    # A1 审计简报组装（≤1200B 硬限；四组输入+绑定字段；超限=失败不截断）
    # ------------------------------------------------------------------
    def a1_compose_brief(self, batch: dict, panorama: list[dict]) -> str:
        base = self.material_base_commit
        if not base:
            raise OrchestrationError(1, "--material-base-commit required (禁隐式读最新 main；"
                                        "GitHub 指针须锚定基线 SHA——charter A-2)")
        files = "、".join(self.material_files[:6]) + ("等" if len(self.material_files) > 6 else "")
        status_line = "、".join(f"{k}:{v}" for k, v in sorted(
            _count_status(panorama).items()))
        task_line = "；".join(f"{t['task_id']}({t['status']})" for t in panorama[:12])
        more = "…" if len(panorama) > 12 else ""
        reply_fmt = ('回复仅一个```json对象：{"result":"ACCEPTED|ACCEPTED_WITH_RISKS|BLOCKED",'
                     '"release_recommendation":"SUBMIT_FOR_APPROVAL|CONDITIONAL_SUBMIT_WITH_RISKS|'
                     'DO_NOT_SUBMIT","standards_matrix":[{"standard_id":"","applicable":true,'
                     '"requirement":"","evidence_refs":[],"result":"PASS|ISSUE|BLOCKED",'
                     '"findings":"","residual_risks":""}],"summary":"<一句话>","findings":[],'
                     '"risks":[]}。结论与建议按映射一一对应；矩阵逐项结论计入总result（任一'
                     'BLOCKED→总BLOCKED）。')
        brief = (
            f"【工程总审计请求·GPT-05】{self.marker_text}\n"
            f"批次{self.batch_id}（需求：{batch.get('requirement')}）。规范版本="
            f"{batch.get('engineering_standard_version')}。任务全景：{status_line}。\n"
            f"任务清单：{task_line}{more}。\n"
            f"读仓库 github.com/damwate/AIEO 固定commit={self.input_material_commit} "
            f"文件：{files}（需求/材料全文在材料，逐项审：七大工程规范适用与执行证据/"
            f"任务状态与遗留/文档变更记录）。\n{reply_fmt}"
        )
        size = len(brief.encode("utf-8"))
        if size > OUTBOUND_LIMIT:
            raise OrchestrationError(1, f"brief {size}B exceeds {OUTBOUND_LIMIT}B hard limit (no truncation)")
        (self.run_dir / "brief.txt").write_text(brief, encoding="utf-8")
        manifest = self.material_manifest_sha256()
        brief_sha = sha256_file(self.run_dir / "brief.txt")
        self.ledger.append({"kind": "A1_BRIEF", "bytes": size, "limit": OUTBOUND_LIMIT,
                            "marker_text": self.marker_text,
                            "audit_round_id": self.idem_keys["idempotency_key"],
                            "input_material_commit": self.input_material_commit,
                            "input_material_manifest_sha256": manifest,
                            "brief_sha256": brief_sha,
                            "brief_schema_version": CONTRACT_VERSION,
                            "outcome": "PASS"})
        return brief

    # ------------------------------------------------------------------
    # A2 真实派单（M2 零修改复用；三态账本；现场字节精确关联）
    # ------------------------------------------------------------------
    def a2_dispatch(self, brief: str, allow_one_redispatch: bool = True) -> Path:
        attempts = 2 if allow_one_redispatch else 1
        last_err = ""
        brief_bytes = (self.run_dir / "brief.txt").read_bytes()
        if any(kind.startswith("A2_") for kind in self.ledger.state_flags()):
            raise OrchestrationError(3, "dispatch already recorded for this run; use resume")
        for attempt in range(1, attempts + 1):
            receipt_path = dispatch_receipt_path(self.run_dir)
            self.ledger.append({"kind": "A2_SEND_INTENT_RECORDED" if attempt == 1
                                else "A2_REDISPATCH_INTENT",
                                "attempt": attempt, "mode": "--new-session",
                                "send_receipt": str(receipt_path),
                                "note": "send attempt; double-verify evidence decides failure class",
                                "outcome": "INTENT"})
            env = dict(os.environ)
            env["AIEO_GPT_CONTROLLER_GENERATION_TIMEOUT_MS"] = "600000"
            env["AIEO_DISPATCH_SEND_RECEIPT"] = str(receipt_path)
            attempt_started = time.time()
            try:
                proc = subprocess.run(
                    ["node", "gpt_dispatch.mjs", "--new-session", "--no-update-pointer", "--message-file",
                     str(self.run_dir / "brief.txt")],
                    cwd=str(PHASE0_TOOLS), env=env, capture_output=True, timeout=900)
            except subprocess.TimeoutExpired as error:
                proc = subprocess.CompletedProcess(error.cmd, 1, error.stdout or b"",
                                                   b"dispatch subprocess timed out")
            (self.run_dir / f"dispatch-stdout-{attempt}.txt").write_bytes(proc.stdout)
            (self.run_dir / f"dispatch-stderr-{attempt}.txt").write_bytes(proc.stderr)
            send_state, fresh, receipt = read_dispatch_receipt(receipt_path, DISPATCH_LOG_DIR, brief_bytes)
            if proc.returncode != 0:
                last_err = f"gpt_dispatch exit {proc.returncode}: {proc.stderr.decode('utf-8', 'replace')[:300]}"
                if send_state == "SEND_CONFIRMED":
                    self.ledger.append({"kind": "A2_SEND_CONFIRMED_COLLECT_FAILED",
                                        "attempt": attempt, "dispatch_dir": fresh.name,
                                        "conversation_uuid": receipt.get("session_id"),
                                        "sent_user_unit_key": receipt.get("user_unit_key"),
                                        "error": last_err, "outcome": "CONFIRMED_COLLECT_FAILED"})
                    raise OrchestrationError(3, f"send confirmed; collection failed (禁重发; use resume): {last_err}")
                if send_state != "NOT_SENT":
                    self.ledger.append({"kind": "A2_SEND_UNCERTAIN", "attempt": attempt,
                                        "error": last_err, "outcome": "BLOCKED"})
                    raise OrchestrationError(3, f"dispatch send state unknown (禁重发): {last_err}")
                self.ledger.append({"kind": "A2_SEND_FAILED", "attempt": attempt,
                                    "error": last_err, "outcome": "FAILED"})
                continue
            if receipt_path.exists() and send_state != "SEND_CONFIRMED":
                raise OrchestrationError(3, "dispatch completed with invalid send receipt (禁重发)")
            fresh = fresh or self._find_dispatch_dir(must=True, since=attempt_started, brief_bytes=brief_bytes)
            fres = json.loads((fresh / "result.json").read_text(encoding="utf-8"))
            self.ledger.append({"kind": "A2_SEND_CONFIRMED", "attempt": attempt,
                                "dispatch_dir": fresh.name,
                                "conversation_uuid": (fres.get("conversation_url") or "").rsplit("/", 1)[-1] or None,
                                "sent_user_unit_key": fres.get("user_unit_key"),
                                "outcome": "CONFIRMED"})
            return fresh
        raise OrchestrationError(3, f"dispatch exhausted: {last_err}")

    def _find_dispatch_dir(self, must: bool, since: float | None = None,
                           brief_bytes: bytes | None = None) -> Path | None:
        """派单现场精确定位（三腿同构）：mtime≥起点-2s 容差（Windows 时钟负偏，
        问题16 P1-1 整改同构）+request.txt 与本次简报字节一致。"""
        cands = sorted(DISPATCH_LOG_DIR.glob("dispatch-*"), key=lambda d: d.stat().st_mtime)
        if since is not None:
            cands = [d for d in cands if d.stat().st_mtime >= since - 2.0]
        if brief_bytes is not None:
            exact = []
            for d in cands:
                req = d / "request.txt"
                try:
                    if req.is_file() and req.read_bytes() == brief_bytes:
                        exact.append(d)
                except OSError:
                    continue
            cands = exact
        if not cands:
            if must:
                raise OrchestrationError(3, "no dispatch evidence dir created by this send")
            return None
        return max(cands, key=lambda d: d.stat().st_mtime)

    # ------------------------------------------------------------------
    # A3 回复采集+契约校验（Ajv 冻结契约；矩阵汇总映射 C1+结论×建议映射 C3
    # fail-closed；失败=保留原始 artifact 不登记）
    # ------------------------------------------------------------------
    def a3_capture_and_validate(self, reply_dir: Path,
                                prev_reply_sha: str | None = None,
                                allow_no_anchor: bool = False) -> dict:
        reply_path = reply_dir / "reply.txt"
        if not reply_path.is_file() or reply_path.stat().st_size == 0:
            raise OrchestrationError(4, f"reply.txt missing/empty in {reply_dir}")
        raw = reply_path.read_bytes()
        reply_sha = sha256_bytes(raw)
        if prev_reply_sha and reply_sha == prev_reply_sha:
            raise OrchestrationError(4, "reply identical to previous reply (L-018 归属冲突)")
        if reply_path.parent != self.run_dir:
            (self.run_dir / "reply.txt").write_bytes(raw)
        # 归属校验（三腿同构：P1-01/P1-1 整改口径）
        sent_key = None
        confirmed_send_exists = False
        intent_only = False
        failed_send_exists = False
        for anchor_kind in ("A2_SEND_CONFIRMED", "A2_SEND_CONFIRMED_COLLECT_FAILED"):
            rec = self.ledger.state_flags().get(anchor_kind)
            if rec:
                confirmed_send_exists = True
                if rec.get("sent_user_unit_key"):
                    sent_key = rec["sent_user_unit_key"]
                    break
        if self.ledger.state_flags().get("A2_SEND_FAILED"):
            failed_send_exists = True
        if self.ledger.state_flags().get("A2_SEND_INTENT_RECORDED") and not confirmed_send_exists and not failed_send_exists:
            intent_only = True
        cross_check_state = None
        if sent_key is None:
            if confirmed_send_exists:
                raise OrchestrationError(4, "confirmed send exists but sent_user_unit_key missing "
                                            "(ownership cannot be proven; fail-closed)")
            if intent_only:
                raise OrchestrationError(4, "send intent without confirmation (send state uncertain; "
                                            "fail-closed even for manual attach)")
            if allow_no_anchor:
                basis = ("leg had failed send attempts only" if failed_send_exists
                         else "leg had no send records")
                cross_check_state = (f"not_applicable_no_leg_send_anchor (manual attach path; {basis})")
            else:
                raise OrchestrationError(4, "send-anchor key unavailable for ownership cross-check (fail-closed)")
        located_key = None
        snap: dict = {}
        for cand_name in ("result.json", "recoll-result.json"):
            cand = reply_path.parent / cand_name
            if cand.is_file():
                try:
                    snap_src = json.loads(cand.read_text(encoding="utf-8"))
                except ValueError:
                    continue
                located_key = snap_src.get("located_user_unit_key") or snap_src.get("user_unit_key")
                snap = {"unit_count": snap_src.get("unit_count"),
                        "assistant_uuid": snap_src.get("assistant_uuid"),
                        "checks": snap_src.get("completion_checks") or snap_src.get("checks"),
                        "snapshot_sha256": sha256_file(cand), "source": cand_name}
                break
        for u_name in ("units-diag.json", "raw-units.json"):
            u_file = reply_path.parent / u_name
            if u_file.is_file():
                try:
                    units_src = json.loads(u_file.read_text(encoding="utf-8"))
                    u_list = units_src if isinstance(units_src, list) else units_src.get("units") or []
                    user_units = [u for u in u_list if isinstance(u, dict) and u.get("role") == "user"]
                    snap["materialized_user_count"] = len(user_units)
                    snap["materialized_user_keys"] = [u.get("key") for u in user_units][-8:]
                    snap["materialized_source"] = u_name
                except (ValueError, AttributeError):
                    pass
                break
        if located_key is None and sent_key is not None:
            raise OrchestrationError(4, "capture evidence lacks located user unit key while send "
                                        "anchor exists (cannot prove reply ownership; fail-closed)")
        if sent_key is not None:
            if not isinstance(located_key, str) or not located_key:
                raise OrchestrationError(4, f"located user unit key invalid "
                                            f"(type={type(located_key).__name__}, value={located_key!r}) "
                                            "while send anchor exists (fail-closed, no registration)")
            if located_key != sent_key:
                raise OrchestrationError(4, f"reply ownership mismatch: located={located_key} "
                                            f"sent={sent_key} (strict equality; fail-closed)")
        self.ledger.append({"kind": "A3_REPLY_CAPTURED", "bytes": len(raw), "reply_sha256": reply_sha,
                            "source_dir": str(reply_path.parent),
                            "marker_text": self.marker_text,
                            "located_user_unit_key": located_key,
                            "snapshot": snap,
                            "extracted_at": utc_now_iso(),
                            "outcome": "CAPTURED"})
        parsed = self.extract_audit_json(raw.decode("utf-8", "replace"))
        if parsed.get("result") not in RESULT_DOMAIN:
            raise OrchestrationError(4, f"reply result '{parsed.get('result')}' outside "
                                        f"{sorted(RESULT_DOMAIN)} (charter §4 结论域)")
        reco = parsed.get("release_recommendation")
        if reco not in RECO_DOMAIN:
            raise OrchestrationError(4, f"release_recommendation '{reco}' outside "
                                        f"{sorted(RECO_DOMAIN)} (契约枚举; fail-closed)")
        # C3：结论×建议一一映射
        expected_reco = RESULT_RECO_MAP[parsed["result"]]
        if reco != expected_reco:
            raise OrchestrationError(4, f"result={parsed['result']} 与 release_recommendation={reco} "
                                        f"矛盾（charter C3 一一映射，预期 {expected_reco}；"
                                        "fail-closed, no registration)")
        # C1：矩阵汇总映射
        matrix = parsed.get("standards_matrix")
        if not isinstance(matrix, list) or not matrix:
            raise OrchestrationError(4, "standards_matrix missing/empty (C1 七大规范逐项矩阵；fail-closed)")
        matrix_results = [m.get("result") for m in matrix]
        bad = [r for r in matrix_results if r not in MATRIX_RESULT_DOMAIN]
        if bad:
            raise OrchestrationError(4, f"standards_matrix results outside {sorted(MATRIX_RESULT_DOMAIN)}: "
                                        f"{bad} (fail-closed)")
        for m in matrix:
            if m.get("applicable") is False and not (m.get("findings") or "").strip():
                raise OrchestrationError(4, "standards_matrix applicable=false without findings 理由 "
                                            "(适用性不等于免检; fail-closed)")
        if "BLOCKED" in matrix_results and parsed["result"] != "BLOCKED":
            raise OrchestrationError(4, f"matrix has BLOCKED but total result={parsed['result']} "
                                        "(C1 矩阵汇总映射矛盾; fail-closed)")
        if "ISSUE" in matrix_results and "BLOCKED" not in matrix_results \
                and parsed["result"] == "ACCEPTED":
            raise OrchestrationError(4, "matrix has ISSUE (no BLOCKED) but total result=ACCEPTED "
                                        "(C1: ISSUE→ACCEPTED_WITH_RISKS; fail-closed)")
        # G05-DR 整改1：冻结映射未定义"矩阵仅 ISSUE、总结果 BLOCKED"组合——批次级
        # BLOCKER 独立决定总结果须经正式契约演进（H2），当前实现不得默许（实战登记
        # 的组合为已披露偏差事实，登记后按本规则执行）。
        if "ISSUE" in matrix_results and "BLOCKED" not in matrix_results \
                and parsed["result"] == "BLOCKED":
            raise OrchestrationError(4, "matrix ISSUE-only but total result=BLOCKED "
                                        "(C1 frozen mapping: ISSUE→ACCEPTED_WITH_RISKS; "
                                        "batch-level BLOCKER semantics require formal "
                                        "contract evolution; fail-closed)")
        # 绑定字段由腿权威注入
        a1 = self.ledger.state_flags().get("A1_BRIEF") or {}
        if not a1.get("brief_sha256"):
            raise OrchestrationError(4, "ledger A1_BRIEF missing brief_sha256 (绑定字段链断裂；fail-closed)")
        report = {
            "contract_version": CONTRACT_VERSION,
            "batch_id": self.batch_id,
            "audit_round_id": self.idem_keys["idempotency_key"],
            "reviewer_agent_id": REVIEWER_AGENT,
            "engine_agent_id": ENGINE_AGENT,
            "input_material_commit": self.input_material_commit,
            "input_material_manifest_sha256": self.material_manifest_sha256(),
            "brief_sha256": a1["brief_sha256"],
            "standards_matrix": matrix,
            "result": parsed["result"],
            "release_recommendation": reco,
            "summary": parsed["summary"],
            "findings": parsed.get("findings", []),
            "risks": parsed.get("risks", []),
        }
        report_file = self.run_dir / "report.json"
        report_file.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        ajv = self.run_ajv_validation(report)
        if not ajv.get("report", {}).get("valid"):
            (self.run_dir / "ajv-failure.json").write_text(
                json.dumps({"report_input": report, "ajv": ajv}, ensure_ascii=False, indent=2),
                encoding="utf-8")
            raise OrchestrationError(4, f"contract validation failed (raw reply kept; no registration): "
                                        f"{json.dumps(ajv)[:400]}")
        envelope = {
            "schema_version": "1.0",
            "message_id": self.message_id(),
            "message_type": "AUDIT_SUBMITTED",
            "created_at": utc_now_iso(),
            "source": {"agent_id": REVIEWER_AGENT, "agent_type": "reviewer"},
            "target": {"agent_id": ORCHESTRATOR_AGENT, "agent_type": "system"},
            "project_id": self.project_id,
            "batch_id": self.batch_id,   # 批次级分支：batch_id 必填
            "task_id": None,             # AUDIT_SUBMITTED 分支契约：task_id=const null
            "correlation_id": self.correlation_id,
            "payload": report,
        }
        self.ledger.append({"kind": "A3_CONTRACT_VALID", "reply_sha256": reply_sha,
                            "result": parsed.get("result"), "message_id": self.message_id(),
                            "report_sha256": sha256_file(report_file),
                            "ajv_report_errors": ajv["report"]["errors"],
                            "outcome": "PASS"})
        return {"parsed": parsed, "report": report, "envelope": envelope,
                "reply_sha256": reply_sha, "report_path": report_file,
                "reply_path": reply_path, "source_dir": reply_path.parent}

    def extract_audit_json(self, text: str) -> dict:
        m = re.search(r"```json\s*(\{.*?\})\s*```", text, re.S)
        if not m:
            m = re.search(r"(\{[\s\S]{0,80}?[\"']result[\"'][\s\S]*\})", text)
        if not m:
            raise OrchestrationError(4, "no audit JSON found in GPT-05 reply")
        try:
            parsed = json.loads(m.group(1))
        except ValueError as exc:
            raise OrchestrationError(4, f"audit JSON unparsable: {exc}") from exc
        missing = {"result", "summary", "standards_matrix", "release_recommendation"} - set(parsed)
        if missing:
            raise OrchestrationError(4, f"audit reply missing required fields: {sorted(missing)}")
        return parsed

    def run_ajv_validation(self, report: dict) -> dict:
        """本地 Ajv 2020 校验：engineering-audit-report 冻结契约（信封/请求体校验在
        a4 构造最终信封后执行 validate_envelope）。"""
        tmp = self.run_dir / "ajv-input-report.json"
        tmp.write_text(json.dumps(report, ensure_ascii=False), encoding="utf-8")
        script = (
            'import { Ajv2020 } from "file:///'
            + str(PHASE0_TOOLS / "node_modules" / "ajv" / "dist" / "2020.js").replace("\\", "/") + '";\n'
            'import { readFileSync } from "node:fs";\n'
            'const report = JSON.parse(readFileSync(process.argv[1], "utf8"));\n'
            'const rpSchema = JSON.parse(readFileSync("'
            + str(AUDIT_SCHEMA).replace("\\", "/") + '", "utf8"));\n'
            'const findingsDef = JSON.parse(readFileSync("'
            + str(FINDINGS_DEF).replace("\\", "/") + '", "utf8"));\n'
            'const ajv = new Ajv2020({ allErrors: true, strict: false });\n'
            'ajv.addSchema(findingsDef);\n'
            'const rp = ajv.compile(rpSchema); const rpOk = rp(report);\n'
            'console.log(JSON.stringify({ report: { valid: !!rpOk, errors: rp.errors ?? [] } }));\n'
        )
        proc = subprocess.run(["node", "--input-type=module", "-e", script, str(tmp)],
                              cwd=str(PHASE0_TOOLS), capture_output=True, timeout=60)
        if proc.returncode != 0:
            raise OrchestrationError(4, f"Ajv node failed: {proc.stderr.decode('utf-8', 'replace')[:300]}")
        return json.loads(proc.stdout.decode("utf-8"))

    def validate_envelope(self, envelope: dict) -> dict:
        """信封+请求体分支校验（A4c 登记前；batch_id 已回填后的最终形态）。"""
        tmp = self.run_dir / "ajv-input-envelope.json"
        tmp.write_text(json.dumps(envelope, ensure_ascii=False), encoding="utf-8")
        script = (
            'import { Ajv2020 } from "file:///'
            + str(PHASE0_TOOLS / "node_modules" / "ajv" / "dist" / "2020.js").replace("\\", "/") + '";\n'
            'import { readFileSync } from "node:fs";\n'
            'const envelope = JSON.parse(readFileSync(process.argv[1], "utf8"));\n'
            'const envSchema = JSON.parse(readFileSync("'
            + str(CONTRACT_DIR / "message-envelope.schema.json").replace("\\", "/") + '", "utf8"));\n'
            'const msgAll = JSON.parse(readFileSync("'
            + str(CONTRACT_DIR / "messages-create.schema.json").replace("\\", "/") + '", "utf8"));\n'
            'const reqSchema = (msgAll.$defs && msgAll.$defs.request)\n'
            '  ? { $defs: msgAll.$defs, allOf: [{ $ref: "#/$defs/request" }] }\n'
            '  : msgAll;\n'
            'const ajv = new Ajv2020({ allErrors: true, strict: false });\n'
            'const ev = ajv.compile(envSchema); const evOk = ev(envelope);\n'
            'const rq = ajv.compile(reqSchema); const rqOk = rq(envelope);\n'
            'console.log(JSON.stringify({ envelope: { valid: !!evOk, errors: ev.errors ?? [] },'
            ' request: { valid: !!rqOk, errors: rq.errors ?? [] } }));\n'
        )
        proc = subprocess.run(["node", "--input-type=module", "-e", script, str(tmp)],
                              cwd=str(PHASE0_TOOLS), capture_output=True, timeout=60)
        if proc.returncode != 0:
            raise OrchestrationError(4, f"Ajv node failed: {proc.stderr.decode('utf-8', 'replace')[:300]}")
        return json.loads(proc.stdout.decode("utf-8"))

    # ------------------------------------------------------------------
    # P0-3：M1 readback → canonical envelope 映射冻结（charter A-3 定稿）
    # ------------------------------------------------------------------
    def _rebuild_canonical_envelope(self, readback: dict, expected: dict) -> dict:
        """以账本预期 envelope 为骨架，九个实质字段逐项以 M1 读回值覆盖重建；
        agent_type 由账本预期恢复（M1 不存储）；source_agent_id 与账本预期不一致
        =绑定矛盾 fail-closed。重建对象与账本预期对象经同一 _canon_sha 比较。"""
        rb = readback if isinstance(readback, dict) else {}
        rebuilt = json.loads(json.dumps(expected, ensure_ascii=False))  # 深拷贝骨架
        if rb.get("source_agent_id") != expected["source"]["agent_id"]:
            raise OrchestrationError(-1, f"readback source_agent_id={rb.get('source_agent_id')} != "
                                         f"expected {expected['source']['agent_id']} "
                                         "(P0-3 绑定矛盾; fail-closed)")
        rebuilt["message_id"] = rb.get("message_id")
        rebuilt["message_type"] = rb.get("message_type")
        rebuilt["source"] = {"agent_id": rb.get("source_agent_id"),
                             "agent_type": expected["source"]["agent_type"]}
        rebuilt["target"] = {"agent_id": rb.get("target_agent_id"),
                             "agent_type": expected["target"]["agent_type"]}
        rebuilt["project_id"] = rb.get("project_id")
        rebuilt["batch_id"] = rb.get("batch_id")
        rebuilt["task_id"] = rb.get("task_id")
        rebuilt["correlation_id"] = rb.get("correlation_id")
        rebuilt["payload"] = rb.get("payload")
        return rebuilt

    def _fetch_message_by_correlation(self) -> dict | None:
        """GET /api/v1/messages?correlation_id=CORR-<run_key>：检索本轮 message
        （读回核验/409 恢复路径；列表项含 message_view 扁平字段）。"""
        code, resp = self.engine.get(
            f"/api/v1/messages?correlation_id={self.correlation_id}")
        self._expect(code, (200,), "GET messages (correlation readback)", resp)
        items = resp.get("items") if isinstance(resp, dict) else resp
        if not isinstance(items, list):
            raise OrchestrationError(-1, "GET /messages response shape unexpected (fail-closed)")
        for it in items:
            if isinstance(it, dict) and it.get("message_id") == self.message_id():
                return it
        return None

    # ------------------------------------------------------------------
    # A4 三步独立登记（A4a 简报 artifact→A4b 报告 artifact→A4c message；
    # 聚合标志 A4_REGISTERED 三子齐才写；部分成功可续）
    # ------------------------------------------------------------------
    def _ledger_verified(self, captured: dict) -> set:
        """逐项只读核实既有成功记录（指纹重算核对，不认非空即过）。"""
        flags = self.ledger.state_flags()
        verified: set = set()
        reply_sha = captured.get("reply_sha256")
        fa = flags.get("A4_ARTIFACT_BRIEF")
        if fa and fa.get("artifact_id"):
            code, art = self.engine.get(f"/api/v1/artifacts/{fa['artifact_id']}")
            if code == 200 and isinstance(art, dict) \
                    and art.get("sha256") == fa.get("brief_sha256"):
                verified.add("artifact_brief")
        fr = flags.get("A4_ARTIFACT_REPORT")
        if fr and fr.get("artifact_id"):
            code, art = self.engine.get(f"/api/v1/artifacts/{fr['artifact_id']}")
            if code == 200 and isinstance(art, dict) \
                    and art.get("sha256") == fr.get("report_sha256"):
                verified.add("artifact_report")
        fm = flags.get("A4_MESSAGE")
        if fm and fm.get("message_id") == self.message_id() \
                and fm.get("reply_sha256") == reply_sha and fm.get("canonical_sha"):
            if fm["canonical_sha"] == _canon_sha(captured["envelope"]):
                verified.add("message")
        return verified

    def a4_register(self, captured: dict,
                    skip: frozenset[str] = frozenset()) -> dict:
        envelope = dict(captured["envelope"])
        result = captured["parsed"]["result"]
        out: dict[str, str | None] = {"artifact_brief_id": None, "artifact_report_id": None,
                                      "message_id": None}

        # ① A4a 简报 artifact（原始简报证据；M1 幂等=路径+SHA）
        brief_rel = f"runtime/engineering-audit-leg/eal-{self.run_key}/brief.txt"
        brief_sha = sha256_file(self.run_dir / "brief.txt")
        if "artifact_brief" in skip:
            out["artifact_brief_id"] = self.ledger.state_flags()["A4_ARTIFACT_BRIEF"]["artifact_id"]
            self.ledger.append({"kind": "A4_SKIP_VERIFIED", "what": "artifact brief",
                                "artifact_id": out["artifact_brief_id"], "outcome": "SKIP"})
        else:
            body = {"type": "OTHER", "path": brief_rel, "sha256": brief_sha}
            code, resp = self.engine.post("/api/v1/artifacts", body)
            out["artifact_brief_id"] = self._register_step(
                code, resp, (200, 201, 202, 409), "artifact brief",
                lambda r: str(r.get("artifact_id") or r.get("id") or ""),
                request_sha=_req_sha(body),
                artifact_verifier=self._make_artifact_verifier(brief_sha))
            self.ledger.append({"kind": "A4_ARTIFACT_BRIEF", "artifact_id": out["artifact_brief_id"],
                                "request_sha": _req_sha(body), "brief_sha256": brief_sha,
                                "outcome": "PASS"})

        # ② A4b 报告 artifact（结论内容唯一权威载体）
        report_rel = f"runtime/engineering-audit-leg/eal-{self.run_key}/report.json"
        report_sha = sha256_file(captured["report_path"])
        if "artifact_report" in skip:
            out["artifact_report_id"] = self.ledger.state_flags()["A4_ARTIFACT_REPORT"]["artifact_id"]
            self.ledger.append({"kind": "A4_SKIP_VERIFIED", "what": "artifact report",
                                "artifact_id": out["artifact_report_id"], "outcome": "SKIP"})
        else:
            body = {"type": "OTHER", "path": report_rel, "sha256": report_sha}
            code, resp = self.engine.post("/api/v1/artifacts", body)
            out["artifact_report_id"] = self._register_step(
                code, resp, (200, 201, 202, 409), "artifact report",
                lambda r: str(r.get("artifact_id") or r.get("id") or ""),
                request_sha=_req_sha(body),
                artifact_verifier=self._make_artifact_verifier(report_sha))
            self.ledger.append({"kind": "A4_ARTIFACT_REPORT", "artifact_id": out["artifact_report_id"],
                                "request_sha": _req_sha(body), "report_sha256": report_sha,
                                "outcome": "PASS"})

        # ③ A4c message（AUDIT_SUBMITTED 批次级信封；登记关联记录，非结论来源）
        envelope["batch_id"] = self.batch_id
        if "message" in skip:
            out["message_id"] = self.message_id()
            self.ledger.append({"kind": "A4_SKIP_VERIFIED", "what": "message",
                                "message_id": out["message_id"], "outcome": "SKIP"})
        else:
            ev = self.validate_envelope(envelope)
            if not (ev.get("envelope", {}).get("valid") and ev.get("request", {}).get("valid")):
                (self.run_dir / "ajv-failure.json").write_text(
                    json.dumps({"envelope_input": envelope, "ajv": ev}, ensure_ascii=False, indent=2),
                    encoding="utf-8")
                raise OrchestrationError(5, f"envelope contract validation failed (no registration): "
                                            f"{json.dumps(ev)[:400]}")
            self.ledger.append({"kind": "A4_MESSAGE_INTENT", "message_id": self.message_id(),
                                "request_sha": _req_sha(envelope),
                                "canonical_sha": _canon_sha(envelope),
                                "outcome": "INTENT"})
            code, resp = self.engine.post("/api/v1/messages", envelope)
            out["message_id"] = self._register_step(
                code, resp, (200, 201, 202, 409), "message",
                lambda r: str(r.get("message_id") or r.get("id") or envelope["message_id"]),
                request_sha=_req_sha(envelope), canonical_sha=_canon_sha(envelope),
                key_evidence=lambda r: (r.get("details") or {}).get("message_id") == envelope["message_id"])
            # G05-DR 整改2：正常成功路径登记后读回核验（与 409 路径同标准）——
            # correlation 读回+重建 canonical envelope+payload 绑定比对，任一不符 fail-closed
            rb = self._fetch_message_by_correlation()
            if rb is None:
                raise OrchestrationError(5, "message POST succeeded but correlation readback found "
                                            "nothing (登记后读回核验 fail-closed)")
            rebuilt = self._rebuild_canonical_envelope(rb, envelope)
            if _canon_sha(rebuilt) != _canon_sha(envelope):
                raise OrchestrationError(5, "message readback rebuilt canonical sha != sent envelope "
                                            "(登记后读回核验 fail-closed)")
            rb_payload = rb.get("payload") or {}
            if rb_payload.get("result") != result or rb_payload.get("batch_id") != self.batch_id:
                raise OrchestrationError(5, "message readback payload binding mismatch "
                                            "(result/batch_id; fail-closed)")
            self.ledger.append({"kind": "A4_MESSAGE", "message_id": out["message_id"],
                                "message_type": envelope["message_type"],
                                "request_sha": _req_sha(envelope),
                                "canonical_sha": _canon_sha(envelope),
                                "report_artifact_sha": report_sha,
                                "brief_sha": brief_sha,
                                "reply_sha256": captured["reply_sha256"], "outcome": "PASS"})

        # 绑定核验（D2：message 与报告 artifact 的 result/batch_id/audit_round_id 一致）
        flags = self.ledger.state_flags()
        fm = flags.get("A4_MESSAGE") or {}
        fr = flags.get("A4_ARTIFACT_REPORT") or {}
        if fm.get("canonical_sha") != _canon_sha(envelope):
            raise OrchestrationError(5, "A4_MESSAGE canonical_sha mismatch after registration "
                                        "(留证链自洽 fail-closed)")
        if fr.get("report_sha256") != sha256_file(captured["report_path"]):
            raise OrchestrationError(5, "A4_ARTIFACT_REPORT sha mismatch (fail-closed)")

        # 聚合标志：三子标志齐才写
        self.ledger.append({"kind": "A4_REGISTERED", "result": result,
                            "note": "three-step registration complete (artifacts x2 + message); "
                                    "no M1 state event — batch/task status untouched (charter §4)",
                            "outcome": "PASS"})
        return out

    def _make_artifact_verifier(self, expected_sha: str):
        def verify(resp):
            aid = str(resp.get("artifact_id") or resp.get("id")
                      or (resp.get("details") or {}).get("artifact_id") or "")
            if not aid:
                return None
            code2, art = self.engine.get(f"/api/v1/artifacts/{aid}")
            if code2 == 200 and isinstance(art, dict) and art.get("sha256") == expected_sha:
                return aid
            return None
        return verify

    def _register_step(self, code: int, resp, want: tuple[int, ...], what: str,
                       extract_id, request_sha: str | None = None,
                       canonical_sha: str | None = None,
                       key_evidence=None, artifact_verifier=None) -> str:
        if code in want and isinstance(resp, dict):
            if code == 409:
                if artifact_verifier is not None:
                    aid = artifact_verifier(resp)
                    if not aid:
                        raise OrchestrationError(5, f"{what} 409 but server record cannot be "
                                                    f"verified (fail-closed): "
                                                    f"{json.dumps(resp, ensure_ascii=False)[:300]}")
                    self.ledger.append({"kind": "A4_DUPLICATE_OK", "what": what,
                                        "artifact_id": aid,
                                        "evidence": ["server-409-path-sha", "get-readback-sha-match"],
                                        "outcome": "IDEMPOTENT_HIT"})
                    return aid
                # message 409：P0-3 五条件 AND（任一缺失 fail-closed，不得判 DUP_OK）
                cond1 = bool(key_evidence and key_evidence(resp))
                rec = (self.ledger.state_flags().get("A4_MESSAGE_INTENT")
                       or self.ledger.state_flags().get("A4_MESSAGE") or {})
                cond2 = bool(rec) and rec.get("canonical_sha") == canonical_sha
                rb = self._fetch_message_by_correlation()
                cond3 = rb is not None
                cond4 = False
                cond5 = False
                if cond3:
                    expected = self._current_expected_envelope()
                    rebuilt = self._rebuild_canonical_envelope(rb, expected)
                    cond4 = _canon_sha(rebuilt) == canonical_sha
                    payload = rb.get("payload") or {}
                    cond5 = (payload.get("batch_id") == self.batch_id
                             and payload.get("audit_round_id") == self.idem_keys["idempotency_key"])
                if not (cond1 and cond2 and cond3 and cond4 and cond5):
                    raise OrchestrationError(5, f"{what} 409 five-condition AND failed "
                                                f"(c1={cond1},c2={cond2},c3={cond3},c4={cond4},"
                                                f"c5={cond5}; fail-closed, no DUP_OK): "
                                                f"{json.dumps(resp, ensure_ascii=False)[:200]}")
                self.ledger.append({"kind": "A4_DUPLICATE_OK", "what": what,
                                    "evidence": ["response-key-match", "ledger-canonical-sha",
                                                 "correlation-readback", "canon-sha-match",
                                                 "report-binding-match"],
                                    "outcome": "IDEMPOTENT_HIT"})
                return extract_id(resp) or "DUPLICATE-VERIFIED"
            return extract_id(resp)
        raise OrchestrationError(5, f"{what} register HTTP {code}: "
                                    f"{json.dumps(resp, ensure_ascii=False)[:300]}")

    def _current_expected_envelope(self) -> dict:
        """重建当前账本锚定的预期 envelope（409 读回比对基准；created_at 参与字段
        结构但被 _canon_sha 剔除）。"""
        a3v = self.ledger.state_flags().get("A3_CONTRACT_VALID") or {}
        report_file = self.run_dir / "report.json"
        if not a3v.get("result") or not report_file.is_file():
            raise OrchestrationError(-1, "expected envelope rebuild: A3_CONTRACT_VALID/report.json "
                                         "missing (fail-closed)")
        payload = json.loads(report_file.read_text(encoding="utf-8"))
        return {
            "schema_version": "1.0",
            "message_id": self.message_id(),
            "message_type": "AUDIT_SUBMITTED",
            "created_at": None,   # canon 剔除；占位保持结构
            "source": {"agent_id": REVIEWER_AGENT, "agent_type": "reviewer"},
            "target": {"agent_id": ORCHESTRATOR_AGENT, "agent_type": "system"},
            "project_id": self.project_id,
            "batch_id": self.batch_id,
            "task_id": None,
            "correlation_id": self.correlation_id,
            "payload": payload,
        }

    # ------------------------------------------------------------------
    # A5 终态：留证完成（M1 批次/任务状态零变化核验）
    # ------------------------------------------------------------------
    def a5_finalize(self, result: str, status_before: str, tasks_before: list[dict] | None = None) -> str:
        code, batch = self.engine.get(f"/api/v1/batches/{self.batch_id}")
        batch = self._expect(code, (200,), "GET batch (finalize)", batch)
        if batch.get("status") != status_before:
            raise OrchestrationError(6, f"batch status changed {status_before}→{batch.get('status')} "
                                        "(GPT-05 不推进任何 M1 状态——出现变化=非法副作用; fail-closed)")
        # G05-DR 整改3：任务状态前后快照逐项核对（批次状态之外的任务级零变化独立证据）
        tasks_after = {t["task_id"]: t["status"] for t in self._fetch_batch_tasks()}
        if tasks_before is not None:
            before = {t["task_id"]: t["status"] for t in tasks_before}
            if before != tasks_after:
                changed = {k: (before.get(k), tasks_after.get(k)) for k in before
                           if before.get(k) != tasks_after.get(k)}
                raise OrchestrationError(6, f"task statuses changed during audit run: {changed} "
                                            "(GPT-05 不推进任何 M1 状态; fail-closed)")
        self.ledger.append({"kind": "A5_DONE", "result": result,
                            "batch_status_unchanged": status_before,
                            "task_statuses_unchanged": bool(tasks_before is not None),
                            "outcome": "PASS"})
        return "AUDIT_REGISTERED"

    # ------------------------------------------------------------------
    # run：全流程（A0→A5）
    # ------------------------------------------------------------------
    def run(self) -> int:
        with RunKeyLock(self.run_dir, holder=f"eal-{self.run_key}-run"):
            return self._run_inner()

    def _run_inner(self) -> int:
        try:
            code, batch_before = self.engine.get(f"/api/v1/batches/{self.batch_id}")
            batch_before = self._expect(code, (200,), "GET batch (pre)", batch_before)
            task, panorama = self.a0_precheck()
            tasks_before = [{"task_id": t["task_id"], "status": t["status"]} for t in panorama]
            self.a1_compose_brief(task, panorama)
            dispatch_dir = self.a2_dispatch(self.run_dir.joinpath("brief.txt").read_text(encoding="utf-8"))
            captured = self.a3_capture_and_validate(dispatch_dir)
            out = self.a4_register(captured)
            result = captured["parsed"]["result"]
            status = self.a5_finalize(result, batch_before.get("status"), tasks_before)
            self._write_report({"result": "ENGINEERING_AUDIT_LEG_PASS", "final_status": status,
                                "verdict": result, **out,
                                "reply_sha256": captured["reply_sha256"],
                                "dispatch_dir": captured["source_dir"].name})
            print(f"RESULT=ENGINEERING_AUDIT_LEG_PASS status={status} verdict={result}", flush=True)
            return 0
        except OrchestrationError as exc:
            self.ledger.append({"kind": "LEG_LEVEL_BLOCKED", "step": exc.step, "reason": exc.reason,
                                "note": "no M1 state change; manual takeover per charter A-3",
                                "outcome": "BLOCKED_LEG"})
            self._write_report({"result": "LEG_LEVEL_BLOCKED", "failed_step": exc.step,
                                "reason": exc.reason})
            print(f"RESULT=LEG_LEVEL_BLOCKED step={exc.step} reason={exc.reason}", flush=True)
            return 2
        except (ConnectionError, OSError, ValueError, subprocess.TimeoutExpired) as exc:
            self.ledger.append({"kind": "LEG_LEVEL_BLOCKED", "step": -1,
                                "reason": f"transport/runtime failure: {exc}",
                                "note": "no auto-retry of side-effecting ops without idempotent confirmation",
                                "outcome": "BLOCKED_LEG"})
            self._write_report({"result": "LEG_LEVEL_BLOCKED", "failed_step": -1, "reason": str(exc)})
            print(f"RESULT=LEG_LEVEL_BLOCKED transport reason={exc}", flush=True)
            return 2

    def _expect(self, code: int, want: tuple[int, ...], what: str, resp) -> dict:
        if code not in want or not isinstance(resp, dict):
            raise OrchestrationError(-1, f"{what}: HTTP {code} "
                                         f"{json.dumps(resp, ensure_ascii=False)[:300]}")
        return resp

    def _write_report(self, payload: dict) -> None:
        self.report_file.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    # ------------------------------------------------------------------
    # resume：charter A-3 逐步骤矩阵（fail-closed，不推测恢复）
    # ------------------------------------------------------------------
    def resume(self) -> int:
        with RunKeyLock(self.run_dir, holder=f"eal-{self.run_key}-resume"):
            return self._resume_outer()

    def _resume_outer(self) -> int:
        try:
            return self._resume_inner()
        except OrchestrationError as exc:
            self.ledger.append({"kind": "LEG_LEVEL_BLOCKED", "step": exc.step, "reason": exc.reason,
                                "phase": "resume", "outcome": "BLOCKED_LEG"})
            self._write_report({"result": "LEG_LEVEL_BLOCKED", "failed_step": exc.step,
                                "reason": exc.reason, "phase": "resume"})
            print(f"RESULT=LEG_LEVEL_BLOCKED step={exc.step} reason={exc.reason}", flush=True)
            return 2
        except (ConnectionError, OSError, ValueError, subprocess.TimeoutExpired) as exc:
            self.ledger.append({"kind": "LEG_LEVEL_BLOCKED", "step": -1,
                                "reason": f"transport/runtime failure during resume: {exc}",
                                "phase": "resume", "outcome": "BLOCKED_LEG"})
            self._write_report({"result": "LEG_LEVEL_BLOCKED", "failed_step": -1,
                                "reason": str(exc), "phase": "resume"})
            print(f"RESULT=LEG_LEVEL_BLOCKED transport reason={exc}", flush=True)
            return 2
        except Exception as exc:
            self.ledger.append({"kind": "LEG_LEVEL_BLOCKED", "step": -1,
                                "reason": f"unexpected {type(exc).__name__} during resume: {exc}",
                                "phase": "resume", "outcome": "BLOCKED_LEG"})
            self._write_report({"result": "LEG_LEVEL_BLOCKED", "failed_step": -1,
                                "reason": f"{type(exc).__name__}: {exc}", "phase": "resume"})
            print(f"RESULT=LEG_LEVEL_BLOCKED unexpected {type(exc).__name__} reason={exc}", flush=True)
            return 2

    def _resume_inner(self) -> int:
        flags = self.ledger.state_flags()
        self.ledger.append({"kind": "RESUME_START", "ledger_flags": sorted(flags.keys())})
        if flags.get("A5_DONE"):
            self.ledger.append({"kind": "RESUME_DONE", "note": "A5_DONE 已登记，本轮完成（A-3 终态行）",
                                "outcome": "PASS"})
            print("RESULT=ENGINEERING_AUDIT_LEG_DONE", flush=True)
            return 0
        sent_anchor = recover_dispatch_anchor(flags, "A2", self.ledger, self.run_dir, DISPATCH_LOG_DIR)
        if sent_anchor is None:
            if any(k.startswith("A2_") for k in flags):
                raise OrchestrationError(-1, "ledger has send intent without confirmation (A-3 fail-closed: "
                                             "cannot prove send state -> leg-level BLOCKED; resend forbidden)")
            task, panorama = self.a0_precheck()
            self.a1_compose_brief(task, panorama)
            return self._continue_from_brief(allow_redispatch=False)
        if "A3_REPLY_CAPTURED" not in flags:
            return self._resume_collect(sent_anchor)
        return self._resume_register()

    def _resume_collect(self, sent_anchor: dict) -> int:
        """A-3 行4 / 断点 S1：连原 conversation UUID 补采；新建会话重发=禁止。"""
        conv_uuid = sent_anchor.get("conversation_uuid")
        sent_key = sent_anchor.get("sent_user_unit_key")
        if not conv_uuid or not sent_key:
            raise OrchestrationError(-1, "ledger missing conversation_uuid/sent_user_unit_key "
                                         "(fail-closed; manual check required)")
        template = Path(__file__).resolve().parent / "review_leg_recoll_template.mjs"
        driver = PHASE0_TOOLS / "review_leg_recoll_driver.mjs"
        failed_dir = DISPATCH_LOG_DIR / sent_anchor.get("dispatch_dir", "")
        if not sent_anchor.get("dispatch_dir") or not failed_dir.is_dir():
            raise OrchestrationError(-1, f"failed dispatch dir not resolvable: {failed_dir} "
                                         "(fail-closed; manual check required)")
        derive_recoll_driver(template, driver, {
            "CONV_UUID": conv_uuid,
            "SENT_USER_UNIT_KEY": sent_key,
            "FAILED_DIR": str(failed_dir).replace("\\", "/"),
            "OUT_DIR": str(self.run_dir).replace("\\", "/"),
            "MARKER_TEXT": self.marker_text,
            "PREV_REPLY_SHA": "",
        })
        self.ledger.append({"kind": "RESUME_COLLECT_INTENT", "conversation_uuid": conv_uuid,
                            "sent_user_unit_key": sent_key, "driver": driver.name,
                            "note": "collection only; no resend", "outcome": "INTENT"})
        proc = subprocess.run(["node", str(driver)], cwd=str(PHASE0_TOOLS),
                              capture_output=True, timeout=600,
                              env={**os.environ,
                                   "AIEO_GPT_CONTROLLER_GENERATION_TIMEOUT_MS": "300000"})
        (self.run_dir / "recoll-stdout.txt").write_bytes(proc.stdout)
        (self.run_dir / "recoll-stderr.txt").write_bytes(proc.stderr)
        if proc.returncode != 0:
            raise OrchestrationError(-1, f"recovery collection failed (禁重发 kept; leg-level BLOCKED; "
                                         f"manual L-018 takeover): {proc.stderr.decode('utf-8', 'replace')[:300]}")
        coll = json.loads((self.run_dir / "recoll-result.json").read_text(encoding="utf-8"))
        self.ledger.append({"kind": "RESUME_COLLECT_OK", "reply_sha256": coll.get("reply_sha256"),
                            "checks": coll.get("checks"), "outcome": "CAPTURED"})
        return self._resume_register()

    def _resume_register(self) -> int:
        """A-3 行5+ / 断点 S2：按原幂等键补登记（不再次触发 GPT-05）。"""
        flags = self.ledger.state_flags()
        src = (flags.get("A3_REPLY_CAPTURED") or {}).get("source_dir")
        reply_dir = Path(src) if src and Path(src).is_dir() else self.run_dir
        captured = self.a3_capture_and_validate(reply_dir)
        skip = frozenset(self._ledger_verified(captured))
        out = self.a4_register(captured, skip=skip)
        result = captured["parsed"]["result"]
        self._write_report({"result": "ENGINEERING_AUDIT_LEG_PASS", "final_status": "AUDIT_REGISTERED",
                            "verdict": result, "reply_sha256": captured["reply_sha256"],
                            "resumed": True, **out})
        print(f"RESULT=ENGINEERING_AUDIT_LEG_PASS (resumed) verdict={result}", flush=True)
        return 0

    def _continue_from_brief(self, allow_redispatch: bool = False) -> int:
        """行1 类恢复的接续：一次派单→采集→登记（不创建第二个审计轮）。"""
        dispatch_dir = self.a2_dispatch(
            self.run_dir.joinpath("brief.txt").read_text(encoding="utf-8"),
            allow_one_redispatch=allow_redispatch)
        captured = self.a3_capture_and_validate(dispatch_dir)
        out = self.a4_register(captured)
        result = captured["parsed"]["result"]
        self._write_report({"result": "ENGINEERING_AUDIT_LEG_PASS", "final_status": "AUDIT_REGISTERED",
                            "verdict": result, "reply_sha256": captured["reply_sha256"],
                            "resumed": True, **out})
        print(f"RESULT=ENGINEERING_AUDIT_LEG_PASS (resumed) verdict={result}", flush=True)
        return 0

    def _resume_done(self, status: str, note: str) -> int:
        self.ledger.append({"kind": "RESUME_DONE", "status": status, "note": note, "outcome": "PASS"})
        print(f"RESULT=ENGINEERING_AUDIT_LEG_DONE status={status}", flush=True)
        return 0

    # ------------------------------------------------------------------
    # attach-reply：人工退路（人工取得审计回复→同一契约+同一幂等键登记）
    # ------------------------------------------------------------------
    def attach_reply(self, reply_file: Path) -> int:
        with RunKeyLock(self.run_dir, holder=f"eal-{self.run_key}-attach"):
            return self._attach_outer(reply_file)

    def _attach_outer(self, reply_file: Path) -> int:
        try:
            return self._attach_inner(reply_file)
        except OrchestrationError as exc:
            self.ledger.append({"kind": "LEG_LEVEL_BLOCKED", "step": exc.step, "reason": exc.reason,
                                "phase": "attach-reply", "outcome": "BLOCKED_LEG"})
            self._write_report({"result": "LEG_LEVEL_BLOCKED", "failed_step": exc.step,
                                "reason": exc.reason, "phase": "attach-reply"})
            print(f"RESULT=LEG_LEVEL_BLOCKED step={exc.step} reason={exc.reason}", flush=True)
            return 2

    def _attach_inner(self, reply_file: Path) -> int:
        if not self.ledger.state_flags().get("A1_BRIEF"):
            # 绑定链完整性：人工路径若账本无简报记录，先组装建立绑定（无 M1 副作用）
            task, panorama = self.a0_precheck()
            self.a1_compose_brief(task, panorama)
        stage_dir = self.run_dir / "manual-attach"
        stage_dir.mkdir(parents=True, exist_ok=True)
        staged = stage_dir / "reply.txt"
        staged.write_bytes(reply_file.read_bytes())
        import shutil
        for cand in ("result.json", "recoll-result.json", "units-diag.json", "raw-units.json"):
            src = reply_file.parent / cand
            if src.is_file() and not (stage_dir / cand).exists():
                shutil.copy(src, stage_dir / cand)
        captured = self.a3_capture_and_validate(stage_dir, allow_no_anchor=True)
        skip = frozenset(self._ledger_verified(captured))
        out = self.a4_register(captured, skip=skip)
        result = captured["parsed"]["result"]
        self.ledger.append({"kind": "ATTACH_REPLY_OK", "source": str(reply_file),
                            "reply_sha256": captured["reply_sha256"], "outcome": "PASS"})
        self._write_report({"result": "ENGINEERING_AUDIT_LEG_PASS", "final_status": "AUDIT_REGISTERED",
                            "verdict": result, "reply_sha256": captured["reply_sha256"],
                            "manual_attach": True, **out})
        print(f"RESULT=ENGINEERING_AUDIT_LEG_PASS (manual attach) verdict={result}", flush=True)
        return 0


def _count_status(panorama: list[dict]) -> dict:
    counts: dict[str, int] = {}
    for t in panorama:
        counts[t["status"]] = counts.get(t["status"], 0) + 1
    return counts


# ---------------------------------------------------------------------------
# setup-agents：一次性 OWNER 引导（三腿 setup 同型；非 engine 运行期路径）
# ---------------------------------------------------------------------------
def setup_agents(m1_url: str) -> int:
    admin = M1Client(m1_url)
    admin.login(os.environ["AIEO_PLATFORM_ADMIN_USERNAME"], os.environ["AIEO_PLATFORM_ADMIN_PASSWORD"])
    tokens_path = RUNTIME_DIR / "service-tokens.json"
    tokens: dict[str, str] = {}
    if tokens_path.is_file():
        try:
            tokens = json.loads(tokens_path.read_text(encoding="utf-8"))
        except ValueError:
            tokens = {}
    issued: list[dict] = []
    for aid, atype, role, issue in (
        (REVIEWER_AGENT, "reviewer", "engineering-audit-session", False),
        (ENGINE_AGENT, "system", "engineering-audit-leg-engine", True),
    ):
        code, resp = admin.post("/api/v1/agents", {"agent_id": aid, "agent_type": atype,
                                                   "role": role, "issue_service_token": issue})
        if code == 409 and isinstance(resp, dict) and resp.get("code") == "RES-0002":
            issued.append({"agent_id": aid, "reused_existing": True})
            continue
        if code not in (200, 201):
            print(f"ERROR: create agent {aid} HTTP {code}: {json.dumps(resp)[:200]}", file=sys.stderr)
            return 2
        issued.append({"agent_id": aid, "http": code, "service_token_issued": issue})
        if issue and resp.get("service_token"):
            tokens[aid] = resp["service_token"]
    if ENGINE_AGENT not in tokens:
        print(f"ERROR: {ENGINE_AGENT} service token unavailable", file=sys.stderr)
        return 2
    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
    tokens_path.write_text(json.dumps(tokens, indent=2), encoding="utf-8")
    os.chmod(tokens_path, 0o600)
    print(f"SETUP_OK agents={json.dumps(issued)} "
          f"tokens=runtime/engineering-audit-leg/service-tokens.json (gitignored)", flush=True)
    return 0


def load_token(token_file: Path) -> str:
    if not token_file.is_file():
        raise OrchestrationError(-1, f"engine token file missing: {token_file} (run setup-agents first)")
    tokens = json.loads(token_file.read_text(encoding="utf-8"))
    tok = tokens.get(ENGINE_AGENT)
    if not tok:
        raise OrchestrationError(-1, f"{ENGINE_AGENT} token not in {token_file}")
    return tok


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="GPT-05 engineering audit leg minimal (charter v0.9, DEC-092)")
    sub = ap.add_subparsers(dest="cmd", required=True)

    ap_setup = sub.add_parser("setup-agents")
    ap_setup.add_argument("--m1-url", default=os.environ.get("AIEO_SCHEDULER_M1_BASE_URL",
                                                             "http://127.0.0.1:8000"))

    def common(p):
        p.add_argument("--run-key", required=True, help="digits; idempotency base (CORR-<run_key>)")
        p.add_argument("--batch-id", required=True, help="BATCH-<digits>; D1 显式 CLI 触发")
        p.add_argument("--project-id", required=True)
        p.add_argument("--input-material-commit", required=True,
                       help="full 40-hex; frozen material version anchor (禁隐式读最新 main)")
        p.add_argument("--material-file", required=True, action="append",
                       help="repo-relative material path (repeatable; GitHub 指针模式)")
        p.add_argument("--material-base-commit", default=None,
                       help="baseline main full SHA containing the material files (pointer mode)")
        p.add_argument("--m1-url", default=os.environ.get("AIEO_SCHEDULER_M1_BASE_URL",
                                                          "http://127.0.0.1:8000"))
        p.add_argument("--token-file", type=Path, default=RUNTIME_DIR / "service-tokens.json")
        p.add_argument("--marker-text", default=None)

    common(sub.add_parser("run"))
    common(sub.add_parser("resume"))

    ap_attach = sub.add_parser("attach-reply")
    common(ap_attach)
    ap_attach.add_argument("--reply-file", required=True, type=Path)

    args = ap.parse_args(argv)
    if args.cmd == "setup-agents":
        return setup_agents(args.m1_url)

    token = load_token(args.token_file)
    leg = EngineeringAuditLeg(run_key=args.run_key, batch_id=args.batch_id,
                              project_id=args.project_id,
                              input_material_commit=args.input_material_commit,
                              material_files=args.material_file,
                              m1_url=args.m1_url, token=token, marker_text=args.marker_text,
                              material_base_commit=args.material_base_commit)
    if args.cmd == "run":
        return leg.run()
    if args.cmd == "resume":
        return leg.resume()
    if args.cmd == "attach-reply":
        return leg.attach_reply(args.reply_file)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
