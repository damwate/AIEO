"""GPT-02 架构审核真实腿最小版编排（b-20261116-gpt02-arch-review-leg；charter v0.3 定稿）。

复用 review_leg.py 框架件（EngineM1Client/ReviewLedger/derive_recoll_driver，S1 裁定
最小参数化复用）与 scheduler.py 件（M1Client/OrchestrationError/sha256_*）——
scheduler.py/review_leg.py 既有行为零变化（29 用例回归门槛）；M1-M4 代码零修改；
M2 派单链（gpt_dispatch.mjs + inbound 采集 + fail-closed 门禁）零修改复用。

纪律落点（charter v0.3）：
- 附录 A-1：ENGINE-02 运行期 M1 白名单 6 实用端点（POST /reports/review 不入——其
  _require_execution 绑定 CODE_REVIEW，不承载 ARCH_REVIEW 登记）；事件白名单=PASS/REWORK；
  BLOCKED/CANCEL/GIT_VALIDATE 等调用层禁入（状态机接受≠engine 有权提交）。
- 附录 A-2 路线 B：报告登记=artifacts+messages 多事务（不经 /reports/review），代价=
  登记与状态推进非原子（恢复协议 A-3 路线 B 专属行兜底）；结论契约=
  contracts/v1.0/arch-review-report.schema.json（冻结）；messages 信封=
  ARCH_REVIEW_SUBMITTED（批次级：batch_id 必填、task_id=null，messages-create 分支契约）。
- §4 BLOCKED 双语义：腿级 BLOCKED=run 层账本停止（M1 任务状态不动）；M1 任务级
  BLOCKED 仅 OWNER。结论 result=BLOCKED 时只登记报告+腿级停止，不提交任何 M1 事件。
- 附录 A-3：九行恢复矩阵（fail-closed 不推测恢复；已发送未采集=禁重发走原会话补采；
  报告已登记但状态仍 ARCH_REVIEW=按原 event_id 幂等续推=路线 B 专属行）。
- §5 异常五类处置表（沿 GPT-03 §5 全表，结论域差异=PASS/REWORK/BLOCKED）。
- §4 一期边界：每任务进入 ARCH_REVIEW 态一次审核轮；REWORK 不自动修订重审；
  任何环节失败任务保持 ARCH_REVIEW 停等人工（腿级 BLOCKED）。

用法：
  python arch_review_leg.py setup-agents --m1-url http://127.0.0.1:8000
      （OWNER 引导：注册 GPT-02 reviewer agent 与 ENGINE-02 服务身份并签发令牌到
        gitignored runtime；一次性准备，非 engine 运行期路径）
  python arch_review_leg.py run --run-key 921001 --task-id T-P1-018 --project-id PRJ-xxx
      --input-material-commit <40hex> --material-file <repo相对路径> [--material-file ...]
      [--m1-url URL] [--token-file path]
      （ARCH_REVIEW→简报→真实派单→契约校验→登记→事件推进 PASS→READY／REWORK→REWORK）
  python arch_review_leg.py resume --run-key ... --task-id ... --project-id ...
      --input-material-commit ... --material-file ...（A-3 矩阵断点恢复）
  python arch_review_leg.py attach-reply ... --reply-file <f>
      （人工退路：人工取得审核回复按同一契约+同一幂等键登记）
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
    OUTBOUND_LIMIT, REST_TIMEOUT, ORCHESTRATOR_AGENT, PHASE0_TOOLS,
    CONTRACT_DIR, DISPATCH_LOG_DIR,
)

REPO_ROOT = Path(os.environ.get("AIEO_ARCH_LEG_REPO_ROOT", "D:/AIEO")).resolve()
RUNTIME_DIR = REPO_ROOT / "runtime" / "arch-review-leg"
ARCH_SCHEMA = CONTRACT_DIR / "arch-review-report.schema.json"

REVIEWER_AGENT = "GPT-02"        # 审核角色（回复 source；结论域 PASS/REWORK/BLOCKED）
ENGINE_AGENT = "ENGINE-02"       # 本机服务身份（engine；C7 §8.6；charter A-1）

# ---------------------------------------------------------------------------
# charter 附录 A-1：ENGINE-02 运行期 M1 白名单（6 实用端点；/reports/review 不入——
# 其绑定 CODE_REVIEW 执行不承载 ARCH_REVIEW 登记；事件白名单=PASS/REWORK）
# ---------------------------------------------------------------------------
GPT02_WHITELIST = {
    ("GET", "/api/v1/tasks/{task_id}"),
    ("GET", "/api/v1/tasks/{task_id}/dependencies"),
    ("GET", "/api/v1/artifacts/{artifact_id}"),
    ("POST", "/api/v1/artifacts"),
    ("POST", "/api/v1/messages"),
    ("POST", "/api/v1/tasks/{task_id}/events"),
}
GPT02_EVENT_WHITELIST = {"PASS", "REWORK"}
# engine 调用层明确禁止的事件值（BLOCKED/CANCEL 任务级仅 OWNER；GIT_VALIDATE 不适用——
# 架构审核无 Git 校验步，charter §6；ARCH_REVIEW 为上游触发事件）
GPT02_EVENT_FORBIDDEN = {"BLOCKED", "CANCEL", "START", "DISPATCH", "PLAN",
                         "ARCH_REVIEW", "DEVELOPMENT_COMPLETED", "GIT_VALIDATE"}

RESULT_DOMAIN = {"PASS", "REWORK", "BLOCKED"}
CONTRACT_VERSION = "1.0"


def _canon_sha(obj: dict) -> str:
    """规范化指纹（剔除 created_at 元数据字段）：重启后信封重建仍可比对内容一致性。"""
    canon = {k: v for k, v in obj.items() if k != "created_at"}
    return sha256_bytes(json.dumps(canon, ensure_ascii=False, sort_keys=True).encode("utf-8"))


def _req_sha(obj) -> str:
    return sha256_bytes(json.dumps(obj, ensure_ascii=False, sort_keys=True).encode("utf-8"))


class RunKeyLock:
    """run_key 跨进程互斥（P1-02 整改，问题14）：OS 级字节锁（Windows=msvcrt.locking
    非阻塞锁首字节；POSIX=fcntl.flock LOCK_NB）——进程退出 OS 自动释放，无 stale 接管
    需求；无法立即取得=失败不等待（并发语义 fail-closed：幂等 ID≠并发安全）。
    覆盖 run/resume/attach-reply 全流程。注意：不用 os.kill(pid,0) 存活检测——
    Windows 上 os.kill 对非 CTRL 信号等于 TerminateProcess（会误杀进程）。"""

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
        self._fd = fd   # 持有至退出（进程死=OS 自动释放锁）
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


class ArchReviewLeg:
    """单轮架构审核编排（A0-A5）；账本驱动可恢复；ENGINE-02 白名单内访问 M1。"""

    def __init__(self, run_key: str, task_id: str, project_id: str,
                 input_material_commit: str, material_files: list[str],
                 m1_url: str, token: str, marker_text: str | None = None,
                 material_base_commit: str | None = None) -> None:
        if not re.fullmatch(r"\d{3,}", run_key):
            raise OrchestrationError(-1, "--run-key must be digits (CORR-<run_key> pattern)")
        if not re.fullmatch(r"[0-9a-f]{40}", input_material_commit):
            raise OrchestrationError(-1, "--input-material-commit must be full 40-hex SHA")
        if not material_files:
            raise OrchestrationError(-1, "--material-file required (at least one; GitHub 指针模式，"
                                         "固定 commit 禁隐式读最新 main——charter A-2)")
        self.run_key = run_key
        self.task_id = task_id
        self.project_id = project_id
        self.input_material_commit = input_material_commit
        self.material_files = list(material_files)
        self.material_base_commit = material_base_commit
        self.marker_text = marker_text or f"[GPT02-R1|{run_key}|{task_id}]"
        self.engine = EngineM1Client(
            m1_url, token,
            whitelist=GPT02_WHITELIST,
            event_whitelist=GPT02_EVENT_WHITELIST,
            event_forbidden=GPT02_EVENT_FORBIDDEN)
        self.run_dir = RUNTIME_DIR / f"arl-{run_key}"
        self.ledger = ReviewLedger(self.run_dir)
        self.correlation_id = f"CORR-{run_key}"
        self.event_base = f"EVT-ARL-{run_key}"
        self.report_file = self.run_dir / "arch-review-leg-report.json"

    # -- 幂等标识（A4：确定性派生，不随重启漂移）--
    def event_id(self, event: str, tail: str) -> str:
        return f"{self.event_base}-{event}-{tail}"

    def message_id(self) -> str:
        """确定性 message_id（模式 MSG-\\d{8}-\\d{6}）：run_key 散列折叠 14 位数字。"""
        h = int(hashlib.sha256(self.run_key.encode()).hexdigest(), 16)
        a, b = h % 100_000_000, (h // 100_000_000) % 1_000_000
        return f"MSG-{a:08d}-{b:06d}"

    @property
    def idem_keys(self) -> dict:
        return {
            "run_key": self.run_key,
            "review_round": 1,
            "idempotency_key": f"{self.run_key}-arch-review-round-1",
            "event_pass": self.event_id("PASS", "01"),
            "event_rework": self.event_id("REWORK", "02"),
            "message_id": self.message_id(),
        }

    # ------------------------------------------------------------------
    # 材料清单指纹（charter A-2 绑定字段：input_material_manifest_sha256）
    # ------------------------------------------------------------------
    def material_manifest_sha256(self) -> str:
        """材料版本锚定指纹：固定 commit 下逐文件 git blob SHA 的确定性清单哈希。

        只读 git（rev-parse <commit>:<path>），不读工作树（禁隐式读最新 main；
        blob 缺失=材料不在该 commit=fail-closed）。"""
        entries = []
        for rel in sorted(set(self.material_files)):
            p = subprocess.run(["git", "-C", str(REPO_ROOT), "rev-parse",
                                f"{self.input_material_commit}:{rel}"],
                               capture_output=True, timeout=60)
            if p.returncode != 0:
                raise OrchestrationError(-1, f"material file {rel} not in commit "
                                             f"{self.input_material_commit} (fail-closed: "
                                             "manifest must anchor the frozen version)")
            entries.append({"path": rel, "blob_sha": p.stdout.decode().strip()})
        return sha256_bytes(json.dumps(entries, sort_keys=True,
                                       ensure_ascii=False).encode("utf-8"))

    # ------------------------------------------------------------------
    # A0 前置只读核查（GET task + GET dependencies；不写任何状态）
    # ------------------------------------------------------------------
    def a0_precheck(self, expect_status: str = "ARCH_REVIEW") -> dict:
        task = self._refetch_task()
        status = task.get("status")
        if status != expect_status:
            raise OrchestrationError(0, f"task {self.task_id} status={status}, expected {expect_status}")
        allowed = task.get("allowed_events") or []
        missing = [ev for ev in ("PASS", "REWORK") if ev not in allowed]
        if missing:
            raise OrchestrationError(0, f"{missing} not in allowed_events={allowed} "
                                        "(ARCH_REVIEW 出边须可用；状态机裁定为准)")
        for field in ("title", "description"):
            if not task.get(field):
                raise OrchestrationError(0, f"task field {field} empty (审核输入四组之一；fail-closed)")
        if not task.get("batch_id"):
            raise OrchestrationError(0, "task batch_id missing (ARCH_REVIEW_SUBMITTED 信封"
                                        " batch_id 必填——messages-create 分支契约)")
        code, deps = self.engine.get(f"/api/v1/tasks/{self.task_id}/dependencies")
        deps = self._expect(code, (200,), "GET dependencies", deps)
        pending = [d for d in (deps.get("dependencies") or deps if isinstance(deps, list)
                               else deps.get("dependencies") or [])
                   if isinstance(d, dict) and d.get("status") not in ("ACCEPTED", None, "N/A")]
        self.ledger.append({"kind": "A0_PRECHECK", "task": {"task_id": self.task_id, "status": status},
                            "batch_id": task.get("batch_id"),
                            "files_scope": task.get("files_scope"),
                            "pending_dependencies": [d.get("task_id") for d in pending][:8],
                            "review_round": 1, "idempotency_key": self.idem_keys["idempotency_key"],
                            "outcome": "PASS"})
        return task, pending

    # ------------------------------------------------------------------
    # A1 审核简报组装（≤1200B 硬限；四组输入+绑定字段；超限=失败不截断）
    # ------------------------------------------------------------------
    def a1_compose_brief(self, task: dict, pending: list[dict]) -> str:
        """charter A-2 四组输入：任务身份/审核范围/依赖信息/审核材料（GitHub 指针+
        固定 commit）。绑定字段（review_round_id/input_material_commit/manifest/
        brief_sha256）由腿权威生成入账本与报告，审查回复只含内容字段。"""
        base = self.material_base_commit
        if not base:
            # 基线取当前 main 头会导致材料漂移——要求显式提供（fail-closed）
            raise OrchestrationError(1, "--material-base-commit required (禁隐式读最新 main；"
                                        "GitHub 指针须锚定基线 SHA——charter A-2)")
        files = "、".join(self.material_files[:6]) + ("等" if len(self.material_files) > 6 else "")
        dep_line = ("无未完成依赖" if not pending else
                    "未完成依赖：" + "、".join(str(d.get("task_id")) for d in pending[:5]))
        reply_fmt = ('回复仅一个```json对象：{"result":"PASS|REWORK|BLOCKED","summary":"<一句话>",'
                     '"findings":[],"required_boundaries":[],"failure_paths":[],"remaining_findings":[],'
                     '"unblocked":true}；result：PASS=架构通过／REWORK=须返工／BLOCKED=架构阻塞须人工决策。')
        brief = (
            f"【架构审核请求·GPT-02】{self.marker_text}\n"
            f"任务{self.task_id}（{task.get('title')}）。范围：{task.get('files_scope') or '（见材料）'}\n"
            f"{dep_line}。\n"
            f"读仓库 github.com/damwate/AIEO（基线main={base}）固定commit="
            f"{self.input_material_commit} 文件：{files}（任务书/方案/验收标准全文在材料，逐项审："
            f"边界/依赖/并发/失败路径）。\n{reply_fmt}"
        )
        size = len(brief.encode("utf-8"))
        if size > OUTBOUND_LIMIT:
            raise OrchestrationError(1, f"brief {size}B exceeds {OUTBOUND_LIMIT}B hard limit (no truncation)")
        (self.run_dir / "brief.txt").write_text(brief, encoding="utf-8")
        manifest = self.material_manifest_sha256()
        brief_sha = sha256_file(self.run_dir / "brief.txt")
        self.ledger.append({"kind": "A1_BRIEF", "bytes": size, "limit": OUTBOUND_LIMIT,
                            "marker_text": self.marker_text,
                            "review_round_id": self.idem_keys["idempotency_key"],
                            "input_material_commit": self.input_material_commit,
                            "input_material_manifest_sha256": manifest,
                            "brief_sha256": brief_sha,
                            "brief_schema_version": CONTRACT_VERSION,
                            "outcome": "PASS"})
        return brief

    # ------------------------------------------------------------------
    # A2 真实派单（M2 零修改复用；账本三态：INTENT→CONFIRMED→（A3）REPLY_CAPTURED）
    # 发送失败 vs 采集失败区分：exit!=0 且现场目录已有发送双验证据（result.json）→
    # 采集 fail-closed 禁重发处置（§5 行2）；无现场证据才允许换新会话重派一次（§5 行1）。
    # ------------------------------------------------------------------
    def a2_dispatch(self, brief: str, allow_one_redispatch: bool = True) -> Path:
        attempts = 2 if allow_one_redispatch else 1
        last_err = ""
        # 现场精确匹配的权威字节=磁盘 brief.txt 原始内容（Windows 文本模式换行翻译
        # 会使字符串往返编码与落盘字节不一致——P1-02 整改随附修正）
        brief_bytes = (self.run_dir / "brief.txt").read_bytes()
        for attempt in range(1, attempts + 1):
            self.ledger.append({"kind": "A2_SEND_INTENT_RECORDED" if attempt == 1
                                else "A2_REDISPATCH_INTENT",
                                "attempt": attempt, "mode": "--new-session",
                                "note": "send attempt; double-verify evidence decides failure class",
                                "outcome": "INTENT"})
            env = dict(os.environ)
            env["AIEO_GPT_CONTROLLER_GENERATION_TIMEOUT_MS"] = "600000"
            attempt_started = time.time()   # 现场目录新鲜度=本次发送尝试起点
            proc = subprocess.run(
                ["node", "gpt_dispatch.mjs", "--new-session", "--message-file",
                 str(self.run_dir / "brief.txt")],
                cwd=str(PHASE0_TOOLS), env=env, capture_output=True, timeout=900)
            (self.run_dir / f"dispatch-stdout-{attempt}.txt").write_bytes(proc.stdout)
            (self.run_dir / f"dispatch-stderr-{attempt}.txt").write_bytes(proc.stderr)
            if proc.returncode != 0:
                last_err = f"gpt_dispatch exit {proc.returncode}: {proc.stderr.decode('utf-8', 'replace')[:300]}"
                fresh = self._find_dispatch_dir(must=False, since=attempt_started,
                                                brief_bytes=brief_bytes)
                if fresh is not None and (fresh / "result.json").is_file():
                    # 发送双验已过而后续采集失败：采集 fail-closed 家族——禁重发（§5 行2/L-018）。
                    try:
                        fres = json.loads((fresh / "result.json").read_text(encoding="utf-8"))
                    except ValueError:
                        fres = {}
                    self.ledger.append({"kind": "A2_SEND_CONFIRMED_COLLECT_FAILED",
                                        "attempt": attempt, "dispatch_dir": fresh.name,
                                        "conversation_uuid": (fres.get("conversation_url") or "").rsplit("/", 1)[-1] or None,
                                        "sent_user_unit_key": fres.get("user_unit_key"),
                                        "error": last_err,
                                        "note": "resume as sent-not-collected; resend forbidden",
                                        "outcome": "CONFIRMED_COLLECT_FAILED"})
                    raise OrchestrationError(3, f"send double-verified but collection failed "
                                                f"(禁重发; run resume for recovery): {last_err}")
                if attempt < attempts:
                    continue   # 无现场证据=发送未成立→§5 行1 允许一次换会话重派
                self.ledger.append({"kind": "A2_SEND_FAILED", "attempt": attempt,
                                    "error": last_err, "outcome": "FAILED"})
                raise OrchestrationError(3, f"dispatch failed (no send evidence): {last_err}")
            # exit==0：发送+采集双成——现场目录含 result.json 与 reply.txt
            fresh = self._find_dispatch_dir(must=True, since=attempt_started,
                                            brief_bytes=brief_bytes)
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
        """派单现场精确定位（P1-02 整改）：候选必须同时满足 ①mtime≥本次尝试起点
        ②现场 request.txt 与本次简报字节一致（本次请求唯一关联标识），杜绝并发派单
        时按全局最新 mtime 串单。"""
        cands = sorted(DISPATCH_LOG_DIR.glob("dispatch-*"), key=lambda d: d.stat().st_mtime)
        if since is not None:
            cands = [d for d in cands if d.stat().st_mtime >= since]
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
    # A3 回复采集+契约校验（Ajv 2020 真校验 arch-review-report 冻结契约；
    # 失败=保留原始 artifact 不登记；绑定字段由腿注入成完整报告）
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
            raise OrchestrationError(4, "reply identical to previous reply (L-018 归属冲突: SHA 全同=排除条件)")
        if reply_path.parent != self.run_dir:
            (self.run_dir / "reply.txt").write_bytes(raw)
        # 归属校验（同构 review_leg r4）：发送锚点键交叉核验；缺锚 fail-closed（attach 显式 not_applicable）
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
                                            "(ownership cannot be proven; fail-closed even for manual attach)")
            if intent_only:
                raise OrchestrationError(4, "send intent without confirmation (send state uncertain; "
                                            "fail-closed even for manual attach; manual forensics + "
                                            "append-only supersede first)")
            if allow_no_anchor:
                basis = ("leg had failed send attempts only" if failed_send_exists
                         else "leg had no send records")
                cross_check_state = (f"not_applicable_no_leg_send_anchor (manual attach path; {basis}; "
                                     "ownership ensured by manual chain)")
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
                snap = {"unit_count": snap_src.get("unit_count"), "unit_keys": snap_src.get("unit_keys"),
                        "assistant_uuid": snap_src.get("assistant_uuid"),
                        "stability": bool((snap_src.get("stability") or {}).get("stable", True))
                        if isinstance(snap_src.get("stability"), dict) else None,
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
        # P1-01 整改（问题14）：归属强制断言——双键均存在时不等即 fail-closed，
        # 不再只记录比较结果（不同 user unit 的回复不得仅因"键非空"通过登记）。
        if located_key and sent_key and located_key != sent_key:
            raise OrchestrationError(4, f"reply ownership mismatch: located={located_key} "
                                        f"sent={sent_key} (P1-01 mandatory assertion; fail-closed, "
                                        "no registration)")
        self.ledger.append({"kind": "A3_REPLY_CAPTURED", "bytes": len(raw), "reply_sha256": reply_sha,
                            "source_dir": str(reply_path.parent),
                            "marker_text": self.marker_text,
                            "located_user_unit_key": located_key,
                            "last_user_assert": bool(located_key),
                            "snapshot": snap,
                            "user_unit_counts": {
                                "at_capture_materialized": snap.get("materialized_user_count"),
                                "target_key": located_key,
                                "sent_key": sent_key,
                                "target_matches_sent_key": (located_key == sent_key)
                                if (located_key and sent_key) else cross_check_state,
                                "snapshot_sha256": snap.get("snapshot_sha256") if isinstance(snap, dict) else None,
                            },
                            "extracted_at": utc_now_iso(),
                            "outcome": "CAPTURED"})
        parsed = self.extract_review_json(raw.decode("utf-8", "replace"))
        if parsed.get("result") not in RESULT_DOMAIN:
            raise OrchestrationError(4, f"reply result '{parsed.get('result')}' outside "
                                        f"{sorted(RESULT_DOMAIN)} (charter §4 结论域)")
        # 绑定字段由腿权威注入（审查回复只含内容字段）→ 完整契约报告
        a1 = self.ledger.state_flags().get("A1_BRIEF") or {}
        if not a1.get("brief_sha256"):
            raise OrchestrationError(4, "ledger A1_BRIEF missing brief_sha256 (绑定字段链断裂；fail-closed)")
        report = {
            "contract_version": CONTRACT_VERSION,
            "task_id": self.task_id,
            "review_round_id": self.idem_keys["idempotency_key"],
            "reviewer_agent_id": REVIEWER_AGENT,
            "engine_agent_id": ENGINE_AGENT,
            "input_material_commit": self.input_material_commit,
            "input_material_manifest_sha256": self.material_manifest_sha256(),
            "brief_sha256": a1["brief_sha256"],
            "result": parsed["result"],
            "summary": parsed["summary"],
            "findings": parsed.get("findings", []),
            "required_boundaries": parsed.get("required_boundaries", []),
            "failure_paths": parsed.get("failure_paths", []),
            "remaining_findings": parsed.get("remaining_findings", []),
            "unblocked": parsed.get("unblocked"),
        }
        report_file = self.run_dir / "report.json"
        report_file.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        ajv = self.run_ajv_validation(report)
        if not (ajv.get("report", {}).get("valid") and ajv.get("envelope", {}).get("valid")
                and ajv.get("request", {}).get("valid")):
            (self.run_dir / "ajv-failure.json").write_text(
                json.dumps({"report_input": report, "ajv": ajv}, ensure_ascii=False, indent=2),
                encoding="utf-8")
            raise OrchestrationError(4, f"contract validation failed (raw reply kept; no registration): "
                                        f"{json.dumps(ajv)[:400]}")
        envelope = {
            "schema_version": "1.0",
            "message_id": self.message_id(),
            "message_type": "ARCH_REVIEW_SUBMITTED",
            "created_at": utc_now_iso(),
            "source": {"agent_id": REVIEWER_AGENT, "agent_type": "reviewer"},
            "target": {"agent_id": ORCHESTRATOR_AGENT, "agent_type": "system"},
            "project_id": self.project_id,
            "batch_id": None,   # a4_register 按 task 视图回填（契约分支：batch_id 必填 string）
            "task_id": None,    # ARCH_REVIEW_SUBMITTED 分支契约：task_id=const null（批次级消息）
            "correlation_id": self.correlation_id,
            "payload": report,
        }
        self.ledger.append({"kind": "A3_CONTRACT_VALID", "reply_sha256": reply_sha,
                            "result": parsed.get("result"), "message_id": self.message_id(),
                            "report_sha256": sha256_file(report_file),
                            "ajv_report_errors": ajv["report"]["errors"],
                            "ajv_envelope_errors": ajv["envelope"]["errors"],
                            "ajv_request_errors": ajv["request"]["errors"],
                            "outcome": "PASS"})
        return {"parsed": parsed, "report": report, "envelope": envelope,
                "reply_sha256": reply_sha, "report_path": report_file,
                "reply_path": reply_path, "source_dir": reply_path.parent}

    def extract_review_json(self, text: str) -> dict:
        m = re.search(r"```json\s*(\{.*?\})\s*```", text, re.S)
        if not m:
            m = re.search(r"(\{[\s\S]{0,80}?[\"']result[\"'][\s\S]*\})", text)
        if not m:
            raise OrchestrationError(4, "no review JSON found in GPT-02 reply")
        try:
            parsed = json.loads(m.group(1))
        except ValueError as exc:
            raise OrchestrationError(4, f"review JSON unparsable: {exc}") from exc
        missing = {"result", "summary"} - set(parsed)
        if missing:
            raise OrchestrationError(4, f"review reply missing required fields: {sorted(missing)}")
        return parsed

    def run_ajv_validation(self, report: dict) -> dict:
        """本地 Ajv 2020 三重校验：arch-review-report 冻结契约 + message-envelope +
        messages-create 请求体（ARCH_REVIEW_SUBMITTED 分支；冻结契约只消费不修改，H2）。"""
        tmp = self.run_dir / "ajv-input-report.json"
        tmp.write_text(json.dumps(report, ensure_ascii=False), encoding="utf-8")
        script = (
            'import { Ajv2020 } from "file:///'
            + str(PHASE0_TOOLS / "node_modules" / "ajv" / "dist" / "2020.js").replace("\\", "/") + '";\n'
            'import { readFileSync } from "node:fs";\n'
            'const report = JSON.parse(readFileSync(process.argv[1], "utf8"));\n'
            'const rpSchema = JSON.parse(readFileSync("'
            + str(ARCH_SCHEMA).replace("\\", "/") + '", "utf8"));\n'
            'const envSchema = JSON.parse(readFileSync("'
            + str(CONTRACT_DIR / "message-envelope.schema.json").replace("\\", "/") + '", "utf8"));\n'
            'const msgAll = JSON.parse(readFileSync("'
            + str(CONTRACT_DIR / "messages-create.schema.json").replace("\\", "/") + '", "utf8"));\n'
            'const reqSchema = (msgAll.$defs && msgAll.$defs.request)\n'
            '  ? { $defs: msgAll.$defs, allOf: [{ $ref: "#/$defs/request" }] }\n'
            '  : msgAll;\n'
            'const ajv = new Ajv2020({ allErrors: true, strict: false });\n'
            'const rp = ajv.compile(rpSchema); const rpOk = rp(report);\n'
            'console.log(JSON.stringify({ report: { valid: !!rpOk, errors: rp.errors ?? [] } }));\n'
        )
        proc = subprocess.run(["node", "--input-type=module", "-e", script, str(tmp)],
                              cwd=str(PHASE0_TOOLS), capture_output=True, timeout=60)
        if proc.returncode != 0:
            raise OrchestrationError(4, f"Ajv node failed: {proc.stderr.decode('utf-8', 'replace')[:300]}")
        out = json.loads(proc.stdout.decode("utf-8"))
        # 信封/请求体校验在 a4 构造最终信封（batch_id 回填）后执行——此处先只校验报告
        return {"report": out["report"], "envelope": {"valid": True, "errors": []},
                "request": {"valid": True, "errors": []}}

    def validate_envelope(self, envelope: dict) -> dict:
        """信封+请求体分支校验（A4 登记前；batch_id 已回填后的最终形态）。"""
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
    # A4 结论登记（路线 B：artifacts→messages；部分成功可续；409 双证核验）
    # ------------------------------------------------------------------
    def _ledger_verified(self, task: dict, captured: dict) -> set:
        """逐项只读核实既有成功记录（指纹重算核对，不认非空即过）。"""
        flags = self.ledger.state_flags()
        verified: set = set()
        reply_sha = captured.get("reply_sha256")
        fa = flags.get("A4_ARTIFACT_REPLY")
        if fa and fa.get("artifact_id"):
            code, art = self.engine.get(f"/api/v1/artifacts/{fa['artifact_id']}")
            if code == 200 and isinstance(art, dict) and art.get("task_id") == self.task_id \
                    and art.get("sha256") == reply_sha:
                verified.add("artifact_reply")
        fr = flags.get("A4_ARTIFACT_REPORT")
        if fr and fr.get("artifact_id"):
            code, art = self.engine.get(f"/api/v1/artifacts/{fr['artifact_id']}")
            if code == 200 and isinstance(art, dict) and art.get("task_id") == self.task_id \
                    and art.get("sha256") == fr.get("report_sha256"):
                verified.add("artifact_report")
        fm = flags.get("A4_MESSAGE")
        if fm and fm.get("message_id") == self.message_id() \
                and fm.get("reply_sha256") == reply_sha and fm.get("canonical_sha"):
            if fm["canonical_sha"] == _canon_sha(captured["envelope"]):
                verified.add("message")
        return verified

    def a4_register(self, task: dict, captured: dict, skip: frozenset[str] = frozenset()) -> dict:
        report = captured["report"]
        envelope = dict(captured["envelope"])
        envelope["batch_id"] = task.get("batch_id")   # 契约分支：ARCH_REVIEW_SUBMITTED batch_id 必填
        if not envelope["batch_id"]:
            raise OrchestrationError(5, "task batch_id missing (ARCH_REVIEW_SUBMITTED 信封契约；fail-closed)")
        result = captured["parsed"]["result"]
        out: dict[str, str | None] = {"artifact_reply_id": None, "artifact_report_id": None,
                                      "message_id": None}

        # ① artifact（原始回复证据；M1 幂等=路径+SHA）
        reply_rel = f"runtime/arch-review-leg/arl-{self.run_key}/reply.txt"
        if "artifact_reply" in skip:
            out["artifact_reply_id"] = self.ledger.state_flags()["A4_ARTIFACT_REPLY"]["artifact_id"]
            self.ledger.append({"kind": "A4_SKIP_VERIFIED", "what": "artifact reply",
                                "artifact_id": out["artifact_reply_id"], "outcome": "SKIP"})
        else:
            body = {"task_id": self.task_id, "type": "REVIEW_EVIDENCE",
                    "path": reply_rel, "sha256": captured["reply_sha256"]}

            def verify_reply_artifact(resp):
                aid = str(resp.get("artifact_id") or resp.get("id")
                          or (resp.get("details") or {}).get("artifact_id") or "")
                if not aid:
                    return None
                code2, art = self.engine.get(f"/api/v1/artifacts/{aid}")
                if code2 == 200 and isinstance(art, dict) and art.get("task_id") == self.task_id \
                        and art.get("sha256") == body["sha256"]:
                    return aid
                return None
            code, resp = self.engine.post("/api/v1/artifacts", body)
            out["artifact_reply_id"] = self._register_step(code, resp, (200, 201, 202, 409), "artifact reply",
                                                           lambda r: str(r.get("artifact_id") or r.get("id") or ""),
                                                           request_sha=_req_sha(body),
                                                           artifact_verifier=verify_reply_artifact)
            self.ledger.append({"kind": "A4_ARTIFACT_REPLY", "artifact_id": out["artifact_reply_id"],
                                "request_sha": _req_sha(body), "reply_sha256": captured["reply_sha256"],
                                "outcome": "PASS"})

        # ② artifact（完整契约报告证据；路径+SHA 幂等）
        report_rel = f"runtime/arch-review-leg/arl-{self.run_key}/report.json"
        report_sha = sha256_file(captured["report_path"])
        if "artifact_report" in skip:
            out["artifact_report_id"] = self.ledger.state_flags()["A4_ARTIFACT_REPORT"]["artifact_id"]
            self.ledger.append({"kind": "A4_SKIP_VERIFIED", "what": "artifact report",
                                "artifact_id": out["artifact_report_id"], "outcome": "SKIP"})
        else:
            body = {"task_id": self.task_id, "type": "REVIEW_EVIDENCE",
                    "path": report_rel, "sha256": report_sha}

            def verify_report_artifact(resp):
                aid = str(resp.get("artifact_id") or resp.get("id")
                          or (resp.get("details") or {}).get("artifact_id") or "")
                if not aid:
                    return None
                code2, art = self.engine.get(f"/api/v1/artifacts/{aid}")
                if code2 == 200 and isinstance(art, dict) and art.get("task_id") == self.task_id \
                        and art.get("sha256") == body["sha256"]:
                    return aid
                return None
            code, resp = self.engine.post("/api/v1/artifacts", body)
            out["artifact_report_id"] = self._register_step(code, resp, (200, 201, 202, 409), "artifact report",
                                                            lambda r: str(r.get("artifact_id") or r.get("id") or ""),
                                                            request_sha=_req_sha(body),
                                                            artifact_verifier=verify_report_artifact)
            self.ledger.append({"kind": "A4_ARTIFACT_REPORT", "artifact_id": out["artifact_report_id"],
                                "request_sha": _req_sha(body), "report_sha256": report_sha,
                                "outcome": "PASS"})

        # ③ message（ARCH_REVIEW_SUBMITTED；幂等=message_id 确定性；409→双证核验）
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
            code, resp = self.engine.post("/api/v1/messages", envelope)
            out["message_id"] = self._register_step(
                code, resp, (200, 201, 202, 409), "message",
                lambda r: str(r.get("message_id") or r.get("id") or envelope["message_id"]),
                request_sha=_req_sha(envelope), canonical_sha=_canon_sha(envelope),
                key_evidence=lambda r: (r.get("details") or {}).get("message_id") == envelope["message_id"])
            self.ledger.append({"kind": "A4_MESSAGE", "message_id": out["message_id"],
                                "message_type": envelope["message_type"],
                                "request_sha": _req_sha(envelope),
                                "canonical_sha": _canon_sha(envelope),
                                "reply_sha256": captured["reply_sha256"], "outcome": "PASS"})
        self.ledger.append({"kind": "A4_RESULT_RECORDED", "result": result,
                            "note": "registered only; event advance is a5 (route B non-atomic by design)",
                            "outcome": "PASS"})
        return out

    def _register_step(self, code: int, resp, want: tuple[int, ...], what: str,
                       extract_id, request_sha: str | None = None,
                       canonical_sha: str | None = None,
                       key_evidence=None, artifact_verifier=None) -> str:
        if code in want and isinstance(resp, dict):
            if code == 409:
                # P1-03：artifact 内容寻址幂等特化——M1 幂等键=path+SHA，服务端 409+GET 回核
                #（task_id+sha256 匹配本次请求）即证明同内容已登记；不依赖账本指纹
                #（账本 append 前崩溃的恢复窗口正是本路径对象）。
                if artifact_verifier is not None:
                    aid = artifact_verifier(resp)
                    if not aid:
                        raise OrchestrationError(5, f"{what} 409 but server record cannot be "
                                                    f"verified (no resolvable id or content "
                                                    f"mismatch; fail-closed): "
                                                    f"{json.dumps(resp, ensure_ascii=False)[:300]}")
                    self.ledger.append({"kind": "A4_DUPLICATE_OK", "what": what,
                                        "artifact_id": aid,
                                        "evidence": ["server-409-path-sha", "get-readback-task-sha-match"],
                                        "outcome": "IDEMPOTENT_HIT"})
                    return aid
                # 双证核验：①响应指认本次键；②账本同请求指纹。缺一 fail-closed。
                if key_evidence is None or not key_evidence(resp):
                    raise OrchestrationError(5, f"{what} 409 key verification failed (response does not "
                                                f"identify our idempotency key; fail-closed): "
                                                f"{json.dumps(resp, ensure_ascii=False)[:300]}")
                kind = {"message": "A4_MESSAGE"}.get(what)
                rec = self.ledger.state_flags().get(kind) if kind else None
                fingerprint_field = "canonical_sha" if canonical_sha is not None else "request_sha"
                expected = canonical_sha if canonical_sha is not None else request_sha
                if not rec or rec.get(fingerprint_field) != expected:
                    raise OrchestrationError(5, f"{what} 409 without matching ledger {fingerprint_field} "
                                                f"(cannot prove same-content replay; fail-closed)")
                self.ledger.append({"kind": "A4_DUPLICATE_OK", "what": what,
                                    "evidence": ["response-key-match", "ledger-request-fingerprint-match"],
                                    "outcome": "IDEMPOTENT_HIT"})
                return extract_id(resp) or "DUPLICATE-VERIFIED"
            return extract_id(resp)
        raise OrchestrationError(5, f"{what} register HTTP {code}: "
                                    f"{json.dumps(resp, ensure_ascii=False)[:300]}")

    # ------------------------------------------------------------------
    # A5 结论推进（事件白名单 PASS/REWORK；BLOCKED=仅登记不推进；A-3 路线 B 专属行）
    # ------------------------------------------------------------------
    def a5_advance(self, result: str) -> str:
        if result == "BLOCKED":
            # §4 BLOCKED 双语义：报告已登记（A4），M1 任务保持 ARCH_REVIEW，OWNER 决策
            self.ledger.append({"kind": "A5_BLOCKED_REGISTERED_ONLY",
                                "note": "result=BLOCKED: report registered (A4), no M1 event submitted; "
                                        "M1 task stays ARCH_REVIEW; OWNER decides task-level BLOCKED",
                                "outcome": "PASS"})
            self._write_report({"result": "ARCH_REVIEW_BLOCKED_REGISTERED",
                                "final_status": "ARCH_REVIEW",
                                "note": "blocked verdict registered; no event; manual takeover"})
            print("RESULT=ARCH_REVIEW_BLOCKED_REGISTERED status=ARCH_REVIEW (no event; OWNER decides)", flush=True)
            return "ARCH_REVIEW"
        event = result   # PASS or REWORK（白名单内，值同名）
        ev_id = self.event_id(event, "01" if event == "PASS" else "02")
        self.engine.check_event(event)
        event_body = {"event": event, "event_id": ev_id, "correlation_id": self.correlation_id}
        event_sha = _req_sha(event_body)
        expected = {"PASS": "READY", "REWORK": "REWORK"}[result]
        # P1-04 整改（问题14）：事件提交前落 intent（event_id+请求指纹），409 幂等核验
        # 独立于消息路径——双证=①账本 intent 指纹匹配 ②响应指认 event_id 或 M1 状态已达
        # 目标终态（事件已生效的最强证据）；不再借道无 kind 映射的 _register_step。
        self.ledger.append({"kind": "A5_EVENT_INTENT", "event": event, "event_id": ev_id,
                            "request_sha": event_sha, "outcome": "INTENT"})
        code, resp = self.engine.post(f"/api/v1/tasks/{self.task_id}/events", event_body)
        if code == 409:
            intent = self.ledger.state_flags().get("A5_EVENT_INTENT") or {}
            fingerprint_ok = intent.get("event_id") == ev_id and intent.get("request_sha") == event_sha
            task_now = self._refetch_task()
            response_ok = ((resp.get("details") or {}).get("event_id") == ev_id
                           or resp.get("event_id") == ev_id
                           or (resp.get("details") or {}).get("code") == "RES-0002")
            terminal_ok = task_now.get("status") == expected
            if not (fingerprint_ok and (response_ok or terminal_ok)):
                raise OrchestrationError(6, f"event {event} 409 verification failed "
                                            f"(fingerprint_ok={fingerprint_ok}, "
                                            f"response_ok={response_ok}, terminal_ok={terminal_ok}; "
                                            f"fail-closed): {json.dumps(resp, ensure_ascii=False)[:300]}")
            self.ledger.append({"kind": "A5_DUPLICATE_OK", "event": event, "event_id": ev_id,
                                "evidence": ["ledger-intent-fingerprint",
                                             "response-key-match" if response_ok else "terminal-state-match"],
                                "outcome": "IDEMPOTENT_HIT"})
        elif code not in (200, 201):
            raise OrchestrationError(6, f"event {event} HTTP {code}: "
                                        f"{json.dumps(resp, ensure_ascii=False)[:300]}")
        task = self._refetch_task()
        status = task.get("status")
        if status != expected:
            raise OrchestrationError(6, f"final status={status}, expected {expected} (result={result})")
        self.ledger.append({"kind": "A5_EVENT_ADVANCED", "event": event, "event_id": ev_id,
                            "status_after": status, "outcome": "PASS"})
        return status

    # ------------------------------------------------------------------
    # run：全流程（A0→A5）
    # ------------------------------------------------------------------
    def run(self) -> int:
        # P1-02：run_key 跨进程互斥覆盖全流程（并发 run/resume/attach 拒绝，fail-closed）
        with RunKeyLock(self.run_dir, holder=f"arl-{self.run_key}-run"):
            return self._run_inner()

    def _run_inner(self) -> int:
        try:
            task, pending = self.a0_precheck()
            self.a1_compose_brief(task, pending)
            dispatch_dir = self.a2_dispatch(self.run_dir.joinpath("brief.txt").read_text(encoding="utf-8"))
            captured = self.a3_capture_and_validate(dispatch_dir)
            out = self.a4_register(self._refetch_task(), captured)
            result = captured["parsed"]["result"]
            if result == "BLOCKED":
                self.a5_advance(result)
                return 0
            status = self.a5_advance(result)
            self._write_report({"result": "ARCH_REVIEW_LEG_PASS", "final_status": status, **out,
                                "verdict": result,
                                "reply_sha256": captured["reply_sha256"],
                                "dispatch_dir": captured["source_dir"].name})
            print(f"RESULT=ARCH_REVIEW_LEG_PASS status={status}", flush=True)
            return 0
        except OrchestrationError as exc:
            self.ledger.append({"kind": "LEG_LEVEL_BLOCKED", "step": exc.step, "reason": exc.reason,
                                "note": "M1 task status unchanged; manual takeover per charter A-3",
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

    def _refetch_task(self) -> dict:
        code, task = self.engine.get(f"/api/v1/tasks/{self.task_id}")
        return self._expect(code, (200,), "GET task", task)

    def _expect(self, code: int, want: tuple[int, ...], what: str, resp) -> dict:
        if code not in want or not isinstance(resp, dict):
            raise OrchestrationError(-1, f"{what}: HTTP {code} "
                                         f"{json.dumps(resp, ensure_ascii=False)[:300]}")
        return resp

    def _write_report(self, payload: dict) -> None:
        self.report_file.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    # ------------------------------------------------------------------
    # resume：charter A-3 九行矩阵（fail-closed，不推测恢复）
    # ------------------------------------------------------------------
    def resume(self) -> int:
        # P1-02：run_key 跨进程互斥覆盖全流程
        with RunKeyLock(self.run_dir, holder=f"arl-{self.run_key}-resume"):
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
        task = self._refetch_task()
        status = task.get("status")
        self.ledger.append({"kind": "RESUME_START", "m1_status": status,
                            "ledger_flags": sorted(flags.keys())})
        # A-3 行 7-9：已出 ARCH_REVIEW 的状态（engine 不动）
        if status == "READY":
            return self._resume_done("READY", "PASS 已推进，本轮完成（A-3 行7）")
        if status == "REWORK":
            return self._resume_done("REWORK", "REWORK 已推进，停等人工修订方案（A-3 行8）")
        if status == "BLOCKED":
            raise OrchestrationError(-1, "M1 task status=BLOCKED: engine must not touch "
                                         "(A-3 行9; OWNER only)")
        if status != "ARCH_REVIEW":
            raise OrchestrationError(-1, f"resume: unhandled M1 status {status} (A-3 matrix)")

        # 行 1-6：ARCH_REVIEW 态断点
        sent_anchor = flags.get("A2_SEND_CONFIRMED") or flags.get("A2_SEND_CONFIRMED_COLLECT_FAILED")
        if sent_anchor is None:
            if any(k.startswith("A2_") for k in flags):
                raise OrchestrationError(-1, "ledger has send intent without confirmation (A-3 vs fail-closed: "
                                             "cannot prove send state -> leg-level BLOCKED; manual "
                                             "dispatch-dir check required; resend forbidden)")
            task, pending = self.a0_precheck()
            self.a1_compose_brief(task, pending)     # 行1-2：重读任务与材料，核对输入版本
            return self._continue_from_brief(allow_redispatch=False)
        if "A3_REPLY_CAPTURED" not in flags:
            return self._resume_collect(sent_anchor)           # 行3：已发送未采集→禁重发补采
        if "A4_MESSAGE" not in flags:
            return self._resume_register()                     # 行4/5：补登记（禁重发）
        # 行6（路线 B 专属）：报告已登记但状态仍 ARCH_REVIEW→核实后按原 event_id 续推
        result = (flags.get("A4_RESULT_RECORDED") or {}).get("result")
        if result not in ("PASS", "REWORK"):
            raise OrchestrationError(-1, "ledger shows report registered but no resolvable verdict "
                                         "(fail-closed; manual verification required)")
        self.ledger.append({"kind": "RESUME_ROUTE_B_READVANCE", "result": result,
                            "note": "report registered but M1 still ARCH_REVIEW; re-advance with "
                                    "original event_id (idempotent; A-3 row6 route-B row)"})
        status = self.a5_advance(result)
        self._write_report({"result": "ARCH_REVIEW_LEG_PASS", "final_status": status,
                            "verdict": result, "resumed": True})
        print(f"RESULT=ARCH_REVIEW_LEG_PASS (resumed) status={status}", flush=True)
        return 0

    def _resume_collect(self, sent_anchor: dict) -> int:
        """A-3 行3 / 断点 S1：连原 conversation UUID 补采；新建会话重发=禁止。"""
        conv_uuid = sent_anchor.get("conversation_uuid")
        sent_key = sent_anchor.get("sent_user_unit_key")
        if not conv_uuid or not sent_key:
            raise OrchestrationError(-1, "ledger missing conversation_uuid/sent_user_unit_key "
                                         "(fail-closed: cannot prove send state; manual check required)")
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
        """A-3 行4/5 / 断点 S2：按原幂等键补登记（不再次触发 GPT-02）。"""
        task = self._refetch_task()
        flags = self.ledger.state_flags()
        src = (flags.get("A3_REPLY_CAPTURED") or {}).get("source_dir")
        reply_dir = Path(src) if src and Path(src).is_dir() else self.run_dir
        captured = self.a3_capture_and_validate(reply_dir)
        skip = frozenset(self._ledger_verified(task, captured))
        out = self.a4_register(task, captured, skip=skip)
        result = captured["parsed"]["result"]
        if result == "BLOCKED":
            self.a5_advance(result)
            return 0
        status = self.a5_advance(result)
        self._write_report({"result": "ARCH_REVIEW_LEG_PASS", "final_status": status,
                            "verdict": result, "reply_sha256": captured["reply_sha256"],
                            "resumed": True, **out})
        print(f"RESULT=ARCH_REVIEW_LEG_PASS (resumed) status={status}", flush=True)
        return 0

    def _continue_from_brief(self, allow_redispatch: bool = False) -> int:
        """行1-2 类恢复的接续：一次派单→采集→登记→推进（不创建第二个审核轮）。"""
        dispatch_dir = self.a2_dispatch(
            self.run_dir.joinpath("brief.txt").read_text(encoding="utf-8"),
            allow_one_redispatch=allow_redispatch)
        captured = self.a3_capture_and_validate(dispatch_dir)
        out = self.a4_register(self._refetch_task(), captured)
        result = captured["parsed"]["result"]
        if result == "BLOCKED":
            self.a5_advance(result)
            return 0
        status = self.a5_advance(result)
        self._write_report({"result": "ARCH_REVIEW_LEG_PASS", "final_status": status,
                            "verdict": result, "reply_sha256": captured["reply_sha256"],
                            "resumed": True, **out})
        print(f"RESULT=ARCH_REVIEW_LEG_PASS (resumed) status={status}", flush=True)
        return 0

    def _resume_done(self, status: str, note: str) -> int:
        self.ledger.append({"kind": "RESUME_DONE", "status": status, "note": note, "outcome": "PASS"})
        print(f"RESULT=ARCH_REVIEW_LEG_DONE status={status}", flush=True)
        return 0

    # ------------------------------------------------------------------
    # attach-reply：人工退路（人工取得审核回复→同一契约+同一幂等键登记）
    # ------------------------------------------------------------------
    def attach_reply(self, reply_file: Path) -> int:
        # P1-02：run_key 跨进程互斥覆盖全流程
        with RunKeyLock(self.run_dir, holder=f"arl-{self.run_key}-attach"):
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
        task = self._refetch_task()
        if task.get("status") != "ARCH_REVIEW":
            raise OrchestrationError(-1, f"attach-reply requires ARCH_REVIEW (task={task.get('status')})")
        if not self.ledger.state_flags().get("A1_BRIEF"):
            # 绑定链完整性：人工接管路径若账本无简报记录（本腿未组装过），先组装建立
            # brief_sha256 绑定（A0+A1 只写本地与账本，无 M1 副作用；charter A-2 绑定字段必填）
            task, pending = self.a0_precheck()
            self.a1_compose_brief(task, pending)
            task = self._refetch_task()
        stage_dir = self.run_dir / "manual-attach"
        stage_dir.mkdir(parents=True, exist_ok=True)
        staged = stage_dir / "reply.txt"
        staged.write_bytes(reply_file.read_bytes())
        # 人工归档现场完整性：reply 同目录的采集快照/units 证据一并入 staged（发送锚点
        # 存在时归属校验依赖 located key；缺失即 fail-closed，不静默降级）
        import shutil
        for cand in ("result.json", "recoll-result.json", "units-diag.json", "raw-units.json"):
            src = reply_file.parent / cand
            if src.is_file() and not (stage_dir / cand).exists():
                shutil.copy(src, stage_dir / cand)
        captured = self.a3_capture_and_validate(stage_dir, allow_no_anchor=True)
        skip = frozenset(self._ledger_verified(task, captured))
        out = self.a4_register(task, captured, skip=skip)
        result = captured["parsed"]["result"]
        if result == "BLOCKED":
            self.a5_advance(result)
            self.ledger.append({"kind": "ATTACH_REPLY_OK", "source": str(reply_file),
                                "reply_sha256": captured["reply_sha256"],
                                "note": "blocked verdict registered (no event)", "outcome": "PASS"})
            return 0
        status = self.a5_advance(result)
        self.ledger.append({"kind": "ATTACH_REPLY_OK", "source": str(reply_file),
                            "reply_sha256": captured["reply_sha256"], "outcome": "PASS"})
        self._write_report({"result": "ARCH_REVIEW_LEG_PASS", "final_status": status,
                            "verdict": result, "reply_sha256": captured["reply_sha256"],
                            "manual_attach": True, **out})
        print(f"RESULT=ARCH_REVIEW_LEG_PASS (manual attach) status={status}", flush=True)
        return 0


# ---------------------------------------------------------------------------
# setup-agents：一次性 OWNER 引导（GPT-03 setup 同型；非 engine 运行期路径）
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
        (REVIEWER_AGENT, "reviewer", "arch-review-session", False),
        (ENGINE_AGENT, "system", "arch-review-leg-engine", True),
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
          f"tokens=runtime/arch-review-leg/service-tokens.json (gitignored)", flush=True)
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
    ap = argparse.ArgumentParser(description="GPT-02 architecture review leg minimal (charter v0.3)")
    sub = ap.add_subparsers(dest="cmd", required=True)

    ap_setup = sub.add_parser("setup-agents")
    ap_setup.add_argument("--m1-url", default=os.environ.get("AIEO_SCHEDULER_M1_BASE_URL",
                                                             "http://127.0.0.1:8000"))

    def common(p):
        p.add_argument("--run-key", required=True, help="digits; idempotency base (CORR-<run_key>)")
        p.add_argument("--task-id", required=True)
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
    leg = ArchReviewLeg(run_key=args.run_key, task_id=args.task_id, project_id=args.project_id,
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
