"""GPT-03 审查真实腿最小版编排（b-20261115-gpt03-review-leg；charter 定稿 v1.0）。

复用 phase1/tools/scheduler.py 框架件（M1Client/OrchestrationError/sha256_*），
scheduler.py 本体零修改（保 T-P1-908 已验收代码不变）；M1-M4 代码零修改；
M2 派单链（gpt_dispatch.mjs + inbound 采集 + fail-closed 门禁）零修改复用。

纪律落点（charter 定稿 v1.0）：
- 附录 B：engine 运行期 M1 访问严格限 8 端点白名单（events 限 GIT_VALIDATE/PASS/REWORK，
  本腿仅用 GIT_VALIDATE/PASS；结论经 POST /reports/review 权威登记并同事务完成状态推进
  =附录 E）；ACK 不在白名单；approvals/任务级 BLOCKED engine 调用层禁止（越界即拒发）。
- 附录 C：审查轮账本八字段组每次阶段变化原子追加（fsync，防强制终止丢断点）；
  三断点快照 S1 发送后未采集 / S2 已采集未登记 / S3 登记或推进结果不确定；
  四条证据规则（发送证明=三态+unit 计数+原会话标识交叉，不只靠 SEND_STARTED=1；
  恢复决策 fail-closed：无法证明即停，不推测恢复）。
- 附录 D：--resume 按 12 行恢复矩阵处置；回滚=停止新增副作用、保留事实、
  从当前 M1 状态交接人工，不回退 M1 状态。
- §5 异常五类处置表 + BLOCKED 语义区分（腿级=run 层账本，M1 任务状态不动；
  M1 task.status=BLOCKED 仅 OWNER，engine 禁止推进）。
- §4 一期边界：每 DEV_REPORTED 任务一次审查轮；REWORK 登记后停等人工不自动重开；
  任何环节失败任务保持当前 M1 状态停等人工。

用法：
  python review_leg.py setup-agents --m1-url http://127.0.0.1:8000
      （OWNER 引导：注册 GPT-03 reviewer agent 与 ENGINE-01 服务身份并签发令牌到
        gitignored runtime（908 bootstrap 先例同型；一次性准备，非 engine 运行期路径））
  python review_leg.py run --run-key 911001 --task-id T-P1-018 --project-id PRJ-xxx
      --reviewed-commit <40hex> --diff-artifact-id ART-DIFF-005 --diff-file <patch>
      --fixture-repo <repo> [--m1-url URL] [--token-file path]
      （DEV_REPORTED→GIT_VALIDATING→CODE_REVIEW→真实派单→契约校验→结论登记推进）
  python review_leg.py resume --ledger-dir <dir>
      （三断点恢复；附录 D 矩阵；禁重发/补登记/只读核实 fail-closed）
  python review_leg.py attach-reply --ledger-dir <dir> --reply-file <f>
      （A6 人工退路：人工补采/人工审查回复按同一契约校验+同一幂等键登记）
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from scheduler import M1Client, OrchestrationError, sha256_bytes, sha256_file  # noqa: E402

REPO_ROOT = Path(os.environ.get("AIEO_REVIEW_LEG_REPO_ROOT", "D:/AIEO")).resolve()
PHASE0_TOOLS = REPO_ROOT / "phase0" / "tools"
CONTRACT_DIR = REPO_ROOT / "contracts" / "v1.0"
RUNTIME_DIR = REPO_ROOT / "runtime" / "review-leg"
DISPATCH_LOG_DIR = REPO_ROOT / "phase0" / "logs"

OUTBOUND_LIMIT = 1200            # 网页出站硬限（不截断不拆分）
REST_TIMEOUT = 60.0
REVIEWER_AGENT = "GPT-03"        # 审查角色（回复 source）
ENGINE_AGENT = "ENGINE-01"       # 本机服务身份（engine；C7 §8.6）
ORCHESTRATOR_AGENT = "AIEO-ORCHESTRATOR"

# ---------------------------------------------------------------------------
# charter 附录 B：engine M1 白名单端点定稿表（8 端点；事件白名单=GIT_VALIDATE/PASS/REWORK）
# ---------------------------------------------------------------------------
ENGINE_WHITELIST = {
    ("GET", "/api/v1/tasks/{task_id}"),
    ("GET", "/api/v1/tasks/{task_id}/dependencies"),
    ("GET", "/api/v1/artifacts/{artifact_id}"),
    ("GET", "/api/v1/board"),
    ("POST", "/api/v1/tasks/{task_id}/events"),
    ("POST", "/api/v1/artifacts"),
    ("POST", "/api/v1/messages"),
    ("POST", "/api/v1/reports/review"),
}
ENGINE_EVENT_WHITELIST = {"GIT_VALIDATE", "PASS", "REWORK"}
# engine 调用层明确禁止的事件值（BLOCKED/CANCEL 等任务级处置仅 OWNER；§5 BLOCKED 语义区分）
ENGINE_EVENT_FORBIDDEN = {"BLOCKED", "CANCEL", "START", "DISPATCH", "PLAN",
                          "ARCH_REVIEW", "DEVELOPMENT_COMPLETED"}

REPLY_RESULT_ALLOWED = {"PASS", "REWORK"}   # 审查内容结论域（BLOCKED 非内容结论，engine 禁止借道）


def utc_now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime()) + "Z"


class EngineM1Client:
    """engine 服务身份（Bearer 令牌）M1 客户端。

    每次调用先对照白名单：越界端点/越界事件值一律 fail-closed 拒发
    （允许访问接口≠允许任意状态推进；事件合法性最终由 M1 状态机裁定，
    本客户端只做调用层前置拦截）。Bearer 认证非 cookie，无 CSRF。

    白名单参数化（GPT-02 腿复用，b-20261116-gpt02-arch-review-leg S1 裁定）：
    默认值=GPT-03 附录 B 常量（现行为零变化）；arch_review_leg 传入自己的
    charter A-1 表。白名单本类不做跨腿共享常量——各腿 charter 是唯一权威源。
    """

    def __init__(self, base_url: str, token: str, whitelist=None,
                 event_whitelist=None, event_forbidden=None) -> None:
        self.base = base_url.rstrip("/")
        self.token = token
        self._whitelist = whitelist or ENGINE_WHITELIST
        self._event_whitelist = event_whitelist or ENGINE_EVENT_WHITELIST
        self._event_forbidden = event_forbidden or ENGINE_EVENT_FORBIDDEN
        self._tmpl_rx = {
            (m, re.compile("^" + re.sub(r"\{[^}]+\}", r"[^/]+", p) + "$"))
            for m, p in self._whitelist
        }

    def check_whitelisted(self, method: str, path: str) -> None:
        for m, rx in self._tmpl_rx:
            if method == m and rx.match(path):
                return
        raise OrchestrationError(-1, f"engine whitelist violation: {method} {path} not in charter appendix B")

    def check_event(self, event: str) -> None:
        if event in self._event_forbidden:
            raise OrchestrationError(-1, f"engine forbidden event value: {event} (task-level only by OWNER)")
        if event not in self._event_whitelist:
            raise OrchestrationError(-1, f"engine event outside whitelist: {event}")

    def _req(self, method: str, path: str, body: dict | None = None,
             timeout: float = REST_TIMEOUT) -> tuple[int, dict | str]:
        self.check_whitelisted(method, path)
        url = f"{self.base}{path}"
        data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
        req = urllib.request.Request(url, data=data, method=method, headers={
            "Accept": "application/json",
            "Authorization": f"Bearer {self.token}",
            **({"Content-Type": "application/json"} if data else {}),
        })
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                raw, code = resp.read(), resp.getcode()
        except urllib.error.HTTPError as exc:
            raw, code = exc.read(), exc.code
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            raise ConnectionError(f"M1 {method} {path} transport error: {exc}") from exc
        try:
            parsed = json.loads(raw.decode("utf-8")) if raw else {}
        except (ValueError, UnicodeDecodeError):
            parsed = raw.decode("utf-8", "replace")
        return code, parsed

    def get(self, path: str, timeout: float = REST_TIMEOUT):
        return self._req("GET", path, None, timeout)

    def post(self, path: str, body: dict, timeout: float = REST_TIMEOUT):
        return self._req("POST", path, body, timeout)


class ReviewLedger:
    """附录 C 八字段组账本：每次阶段变化原子追加一条（fsync 持久化）。"""

    def __init__(self, run_dir: Path) -> None:
        self.run_dir = run_dir
        run_dir.mkdir(parents=True, exist_ok=True)
        self.path = run_dir / "ledger.jsonl"

    def append(self, record: dict) -> None:
        rec = {"ts_utc": utc_now_iso(), **record}
        line = json.dumps(rec, ensure_ascii=False, default=str) + "\n"
        with open(self.path, "a", encoding="utf-8") as fh:
            fh.write(line)
            fh.flush()
            os.fsync(fh.fileno())

    def load(self) -> list[dict]:
        if not self.path.is_file():
            return []
        out = []
        for line in self.path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line:
                out.append(json.loads(line))
        return out

    def state_flags(self) -> dict:
        """提取账本关键状态标志（三断点判定依据，附录 C；同 kind 取最后一条）。"""
        flags: dict[str, dict] = {}
        for rec in self.load():
            k = rec.get("kind")
            if k:
                flags[k] = rec
        return flags

    def latest(self, kind: str) -> dict | None:
        for rec in reversed(self.load()):
            if rec.get("kind") == kind:
                return rec
        return None


def derive_recoll_driver(template_path: Path, out_path: Path, params: dict[str, str]) -> None:
    """补采驱动派生（L-018 第 3/4 条纪律的机器化）：模板 + 参数替换。

    参数：CONV_UUID / SENT_USER_UNIT_KEY（期望送达 unit 键）/ FAILED_DIR（现场归档）
    / MARKER_TEXT（简报标记文本，归属校验）/ PREV_REPLY_SHA（前轮 reply SHA 排除）。
    派生后立即回读断言：头部三参数行逐项命中（未命中即抛错，不放行）。
    """
    text = template_path.read_text(encoding="utf-8")
    for key, val in params.items():
        token = f"__{key}__"
        if token not in text:
            raise OrchestrationError(-1, f"recoll template missing token {token}")
        if any(ch in val for ch in ('"', "'", "\\", "\n", "\r", "`")):
            raise OrchestrationError(-1, f"derived param {key} contains JS-unsafe character")
        text = text.replace(token, val)
    out_path.write_text(text, encoding="utf-8")
    head = "\n".join(out_path.read_text(encoding="utf-8").splitlines()[:40])
    for key in ("CONV_UUID", "SENT_USER_UNIT_KEY", "FAILED_DIR", "MARKER_TEXT"):
        if params.get(key) and params[key] not in head:
            raise OrchestrationError(-1, f"derived driver param not asserted in header: {key}")


class ReviewLeg:
    """单轮审查编排（R0-R6）；账本驱动可恢复；engine 白名单内访问 M1。"""

    def __init__(self, run_key: str, task_id: str, project_id: str, reviewed_commit: str,
                 diff_artifact_id: str, diff_file: Path, fixture_repo: Path,
                 m1_url: str, token: str, marker_text: str | None = None,
                 brief_mode: str = "inline", material_repo_path: str | None = None,
                 material_base_commit: str | None = None) -> None:
        if not re.fullmatch(r"\d{3,}", run_key):
            raise OrchestrationError(-1, "--run-key must be digits (CORR-<run_key> pattern)")
        if not re.fullmatch(r"[0-9a-f]{40}", reviewed_commit):
            raise OrchestrationError(-1, "--reviewed-commit must be full 40-hex SHA")
        self.run_key = run_key
        self.task_id = task_id
        self.project_id = project_id
        self.reviewed_commit = reviewed_commit
        self.diff_artifact_id = diff_artifact_id
        self.diff_file = diff_file
        self.fixture_repo = fixture_repo
        self.marker_text = marker_text or f"[GPT03-R1|{run_key}|{task_id}]"
        if brief_mode not in ("inline", "pointer"):
            raise OrchestrationError(-1, "brief_mode must be inline|pointer")
        self.brief_mode = brief_mode
        self.material_repo_path = material_repo_path
        self.material_base_commit = material_base_commit
        self.engine = EngineM1Client(m1_url, token)
        self.run_dir = RUNTIME_DIR / f"rvl-{run_key}"
        self.ledger = ReviewLedger(self.run_dir)
        self.correlation_id = f"CORR-{run_key}"
        self.event_base = f"EVT-RVL-{run_key}"
        self.report_file = self.run_dir / "review-leg-report.json"

    # -- 幂等标识（A4：重放同一请求原文→M1 无重复登记；确定性派生，不随重启漂移）--
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
            "idempotency_key": f"{self.run_key}-review-round-1",
            "event_git_validate": self.event_id("GIT_VALIDATE", "01"),
            "event_pass": self.event_id("PASS", "02"),
            "message_id": self.message_id(),
            "report_natural_key": {"execution_id": "<latest_execution>",
                                   "reviewed_commit": self.reviewed_commit},
        }

    # ------------------------------------------------------------------
    # R0 前置只读核查（GET task + GET artifact；不写任何状态）
    # ------------------------------------------------------------------
    def r0_precheck(self, expect_status: str = "DEV_REPORTED") -> dict:
        task = self._refetch_task()
        status = task.get("status")
        if status != expect_status:
            raise OrchestrationError(0, f"task {self.task_id} status={status}, expected {expect_status}")
        execution = task.get("latest_execution")
        if not execution or not execution.get("execution_id"):
            raise OrchestrationError(0, "latest_execution missing (no execution to review)")
        if "GIT_VALIDATE" not in (task.get("allowed_events") or []):
            raise OrchestrationError(0, f"GIT_VALIDATE not in allowed_events={task.get('allowed_events')}")
        # diff artifact 交叉核验：task 关联 + 本地字节 SHA 一致（附录 C 证据规则①交叉证明）
        code, art = self.engine.get(f"/api/v1/artifacts/{self.diff_artifact_id}")
        art = self._expect(code, (200,), f"GET artifact {self.diff_artifact_id}", art)
        if art.get("task_id") != self.task_id:
            raise OrchestrationError(0, f"artifact {self.diff_artifact_id} belongs to "
                                        f"{art.get('task_id')}, not {self.task_id}")
        local_sha = sha256_file(self.diff_file)
        if art.get("sha256") and art["sha256"] != local_sha:
            raise OrchestrationError(0, f"diff artifact sha mismatch: m1={art.get('sha256')} local={local_sha}")
        self.ledger.append({"kind": "R0_PRECHECK", "task": {"task_id": self.task_id, "status": status},
                            "execution_id": execution["execution_id"], "batch_id": task.get("batch_id"),
                            "review_round": 1, "idempotency_key": self.idem_keys["idempotency_key"],
                            "diff_artifact_id": self.diff_artifact_id,
                            "diff_local_sha256": local_sha, "outcome": "PASS"})
        return task

    # ------------------------------------------------------------------
    # R1 状态推进：GIT_VALIDATE → 只读 Git 校验 → PASS（附录 D 第 1-4 行恢复语义；
    # event_id 确定性 → 响应丢失重启后同 id 重试幂等，A7）
    # ------------------------------------------------------------------
    def r1_git_validate_and_pass(self) -> None:
        ev_id = self.event_id("GIT_VALIDATE", "01")
        self.engine.check_event("GIT_VALIDATE")
        code, resp = self.engine.post(f"/api/v1/tasks/{self.task_id}/events",
                                      {"event": "GIT_VALIDATE", "event_id": ev_id,
                                       "correlation_id": self.correlation_id})
        resp = self._expect(code, (200, 201, 409), "event GIT_VALIDATE", resp)
        task = self._refetch_task()
        if task.get("status") not in ("GIT_VALIDATING", "CODE_REVIEW"):
            raise OrchestrationError(1, f"status after GIT_VALIDATE={task.get('status')}, "
                                        "expected GIT_VALIDATING (or CODE_REVIEW if PASS already applied)")
        self.ledger.append({"kind": "R1_EVENT_GIT_VALIDATE", "event_id": ev_id,
                            "status_after": task.get("status"),
                            "response_sha": sha256_bytes(
                                json.dumps(resp, ensure_ascii=False, sort_keys=True).encode())})
        if task.get("status") == "GIT_VALIDATING":
            self.git_verify()
        if task.get("status") == "GIT_VALIDATING":
            ev2 = self.event_id("PASS", "02")
            self.engine.check_event("PASS")
            code, resp2 = self.engine.post(f"/api/v1/tasks/{self.task_id}/events",
                                           {"event": "PASS", "event_id": ev2,
                                            "correlation_id": self.correlation_id})
            resp2 = self._expect(code, (200, 201, 409), "event PASS", resp2)
            self.ledger.append({"kind": "R1_EVENT_PASS", "event_id": ev2,
                                "response_sha": sha256_bytes(
                                    json.dumps(resp2, ensure_ascii=False, sort_keys=True).encode())})
        task = self._refetch_task()
        if task.get("status") != "CODE_REVIEW":
            raise OrchestrationError(1, f"status after R1={task.get('status')}, expected CODE_REVIEW")
        self.ledger.append({"kind": "R1_DONE", "status_after": task.get("status"), "outcome": "PASS"})

    def git_verify(self) -> None:
        """只读 Git 校验（真实执行，不 mock）：commit 在位+父提交在+变更文件集与
        已核验 diff artifact（SHA 已在 R0 对齐）一致。"""
        def git(*a: str) -> str:
            p = subprocess.run(["git", "-C", str(self.fixture_repo), *a],
                               capture_output=True, timeout=60,
                               env={**os.environ, "GIT_OPTIONAL_LOCKS": "0"})
            if p.returncode != 0:
                raise OrchestrationError(1, f"git {' '.join(a[:3])} exit {p.returncode}: "
                                            f"{p.stderr.decode('utf-8', 'replace')[:200]}")
            return p.stdout.decode("utf-8", "replace")
        git("cat-file", "-e", f"{self.reviewed_commit}^{{commit}}")
        parents = git("show", "-s", "--format=%P", self.reviewed_commit).split()
        if not parents:
            raise OrchestrationError(1, "reviewed commit has no parent (base check impossible)")
        changed = [ln.split("\t")[-1] for ln in
                   git("show", "--numstat", "--format=", self.reviewed_commit).splitlines() if ln.strip()]
        patch_names = set()
        for ln in self.diff_file.read_text(encoding="utf-8", errors="replace").splitlines():
            m = re.match(r"\+\+\+ b/(.+)$", ln)
            if m and m.group(1) != "/dev/null":
                patch_names.add(m.group(1))
        missing = [f for f in changed if f not in patch_names]
        if missing:
            raise OrchestrationError(1, f"changed files not covered by diff artifact: {missing[:5]}")
        self.ledger.append({"kind": "R1_GIT_VERIFY", "commit": self.reviewed_commit,
                            "changed_files": changed, "outcome": "PASS"})

    # ------------------------------------------------------------------
    # R2 审查简报组装（≤1200B 硬限；标记文本供归属校验；超限=失败不截断）
    # ------------------------------------------------------------------
    def r2_compose_brief(self, task: dict) -> str:
        """简报组装（≤1200B 硬限，不截断不拆分）。
        inline 模式：diff 内联（小 diff）；pointer 模式（charter §3/L-007）：diff+AC
        材料文件已入库，简报给 GitHub 裸域名指针（防 Composer 链接化，908 先例）+
        审查 commit，由审查方按基线 SHA 读文件。"""
        patch = self.diff_file.read_text(encoding="utf-8", errors="replace")
        reply_fmt = ('回复仅一个```json对象：{"result":"PASS|REWORK","summary":"<一句话>",'
                     '"issues":["<具体问题>…"],"reviewed_commit":"' + self.reviewed_commit + '"}'
                     '；result仅PASS/REWORK。')
        if self.brief_mode == "pointer":
            if not self.material_repo_path or not self.material_base_commit:
                raise OrchestrationError(2, "pointer mode requires --material-repo-path and "
                                            "--material-base-commit (material file must be pushed)")
            brief = (
                f"【代码审查请求·GPT-03】{self.marker_text}\n"
                f"任务{self.task_id} 审查commit={self.reviewed_commit}（fixture分支单提交）。\n"
                f"读仓库 github.com/damwate/AIEO（基线main={self.material_base_commit}）文件 "
                f"{self.material_repo_path}：含验收标准与diff全文（已核验SHA）。逐行审查后回复。\n"
                f"{reply_fmt}"
            )
        else:
            if len(patch.encode("utf-8")) > 950:
                raise OrchestrationError(2, f"diff patch {len(patch.encode('utf-8'))}B too large for inline brief "
                                            "(1200B outbound limit; use --brief-mode pointer per L-007)")
            ac_lines = "".join(f"\n- {a}" for a in (task.get("acceptance_criteria") or [])[:4])
            brief = (
                f"【代码审查请求·GPT-03】{self.marker_text}\n"
                f"任务{self.task_id} 审查commit={self.reviewed_commit}（仅此单提交）。\n"
                f"验收标准：{ac_lines}\n"
                f"--- diff（已核验 SHA，逐行审查）---\n"
                f"{patch}\n"
                f"{reply_fmt}"
            )
        size = len(brief.encode("utf-8"))
        if size > OUTBOUND_LIMIT:
            raise OrchestrationError(2, f"brief {size}B exceeds {OUTBOUND_LIMIT}B hard limit (no truncation)")
        (self.run_dir / "brief.txt").write_text(brief, encoding="utf-8")
        self.ledger.append({"kind": "R2_BRIEF", "bytes": size, "limit": OUTBOUND_LIMIT,
                            "mode": self.brief_mode,
                            "marker_text": self.marker_text, "outcome": "PASS"})
        return brief

    # ------------------------------------------------------------------
    # R3 真实派单（M2 零修改复用；账本三态：INTENT→CONFIRMED→（R4）REPLY_CAPTURED）
    # 发送失败 vs 采集失败区分：exit!=0 且现场目录已有发送双验证据（result.json）→
    # 按采集 fail-closed 禁重发处置（§5 行2）；无现场证据才允许换新会话重派一次（§5 行1）。
    # ------------------------------------------------------------------
    def r3_dispatch(self, brief: str, allow_one_redispatch: bool = True) -> Path:
        attempts = 2 if allow_one_redispatch else 1
        last_err = ""
        for attempt in range(1, attempts + 1):
            self.ledger.append({"kind": "R3_SEND_INTENT_RECORDED" if attempt == 1
                                else "R3_REDISPATCH_INTENT",
                                "attempt": attempt, "mode": "--new-session",
                                "note": "send attempt; double-verify evidence decides failure class",
                                "outcome": "INTENT"})
            env = dict(os.environ)
            env["AIEO_GPT_CONTROLLER_GENERATION_TIMEOUT_MS"] = "600000"
            attempt_started = time.time()   # 现场目录新鲜度=本次发送尝试起点（防陈旧目录误判已发送）
            proc = subprocess.run(
                ["node", "gpt_dispatch.mjs", "--new-session", "--message-file",
                 str(self.run_dir / "brief.txt")],
                cwd=str(PHASE0_TOOLS), env=env, capture_output=True, timeout=900)
            (self.run_dir / f"dispatch-stdout-{attempt}.txt").write_bytes(proc.stdout)
            (self.run_dir / f"dispatch-stderr-{attempt}.txt").write_bytes(proc.stderr)
            if proc.returncode != 0:
                last_err = f"gpt_dispatch exit {proc.returncode}: {proc.stderr.decode('utf-8', 'replace')[:300]}"
                fresh = self._find_dispatch_dir(must=False, since=attempt_started)
                if fresh is not None and (fresh / "result.json").is_file():
                    # 发送双验已过而后续采集失败：采集 fail-closed 家族——禁重发（§5 行2/L-018）。
                    # P1-03：落账必含原会话与发送证据（conversation_uuid/sent_user_unit_key），
                    # resume 将本记录视为"已发送未采集"断点接原会话补采。
                    try:
                        fres = json.loads((fresh / "result.json").read_text(encoding="utf-8"))
                    except ValueError:
                        fres = {}
                    self.ledger.append({"kind": "R3_SEND_CONFIRMED_COLLECT_FAILED",
                                        "attempt": attempt, "dispatch_dir": fresh.name,
                                        "conversation_uuid": (fres.get("conversation_url") or "").rsplit("/", 1)[-1] or None,
                                        "sent_user_unit_key": fres.get("user_unit_key"),
                                        "next_user_unit_key": fres.get("next_user_unit_key"),
                                        "unit_count": fres.get("unit_count"),
                                        "result_json_sha256": sha256_file(fresh / "result.json"),
                                        "error": last_err,
                                        "note": "resend forbidden; resume treats as sent-not-captured breakpoint",
                                        "outcome": "CONFIRMED"})
                    raise OrchestrationError(3, f"send double-verified but collection failed "
                                                f"(禁重发; run resume for recovery): {last_err}")
                self.ledger.append({"kind": "R3_SEND_FAILED", "attempt": attempt,
                                    "error": last_err, "outcome": "FAIL"})
                continue
            ddir = self._find_dispatch_dir(since=attempt_started)
            result = json.loads((ddir / "result.json").read_text(encoding="utf-8"))
            self.ledger.append({
                "kind": "R3_SEND_CONFIRMED", "attempt": attempt, "dispatch_dir": ddir.name,
                # 附录 C ①任务与审查轮标识 / ②会话标识 / ③派单账本 / ④会话快照：
                "review_round": 1, "idempotency_key": self.idem_keys["idempotency_key"],
                "conversation_uuid": (result.get("conversation_url") or "").rsplit("/", 1)[-1],
                "conversation_created_at": utc_now_iso(),
                "profile": "runtime/chrome_profiles/gpt-poc", "session_role": "reviewer",
                "ownership_check": "deferred_to_R4_marker_locate",
                "sent_user_unit_key": result.get("user_unit_key"),
                "next_user_unit_key": result.get("next_user_unit_key"),
                "assistant_uuid": result.get("assistant_uuid"),
                "unit_count": result.get("unit_count"),
                "unit_keys": result.get("unit_keys"),
                "result_json_sha256": sha256_file(ddir / "result.json"),
                "completion_checks": result.get("completion_checks"),
                # 附录 C ④发送前后 user unit 计数（三时点独立证据）：
                # 发送前=0（--new-session 语义：会话由本次发送创建，构造性成立）；
                # 发送时=1（本腿唯一 user unit，键由发送双验锚定）；采集时=R4 快照。
                "user_unit_counts": {
                    "pre_send": 0,
                    "pre_send_evidence_class": "presumed",
                    "pre_send_basis": "new-session: conversation created by this send (no pre-read)",
                    "at_send": 1,
                    "at_send_evidence_class": "presumed-pinned",
                    "at_send_basis": "single-shot send; our user unit key pinned by send double-verify "
                                     "(count not read from session at send time)",
                    "at_send_key": result.get("user_unit_key"),
                    "source": "dispatch result.json (send double-verify pinned user unit key)",
                    "snapshot_sha256": sha256_file(ddir / "result.json"),
                },
                "send_state": "SEND_CONFIRMED",
                "outcome": "CONFIRMED"})
            return ddir
        raise OrchestrationError(3, f"dispatch failed after {attempts} attempt(s) "
                                    f"(§5 row1 limit reached; leg-level BLOCKED): {last_err}")

    def _find_dispatch_dir(self, must: bool = True, since: float | None = None) -> Path | None:
        lower = time.time() - 3600 if since is None else since
        cands = [d for d in DISPATCH_LOG_DIR.glob("dispatch-*")
                 if d.is_dir() and d.stat().st_mtime >= lower]
        if not cands:
            if must:
                raise OrchestrationError(3, "no dispatch evidence dir created by this send")
            return None
        return max(cands, key=lambda d: d.stat().st_mtime)

    # ------------------------------------------------------------------
    # R4 回复采集+904 冻结契约校验（Ajv 2020 真校验；失败=保留原始 artifact 不登记）
    # ------------------------------------------------------------------
    def r4_capture_and_validate(self, reply_dir: Path, batch_id: str | None,
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
        # 附录 C ②归属校验结果 / ④采集快照证据：从采集现场 result（dispatch 或 recoll）提取
        snap: dict = {}
        located_key = None
        # 发送键交叉核验（P2-01/R4 整改）：采集定位键必须与账本发送锚点键一致。
        # 缺键处置：自动路径（run/resume）缺发送锚点=fail-closed（None 不得视为已完成交叉
        # 核验）；仅 attach-reply 人工路径（本腿未发送）显式登记 not_applicable。
        sent_key = None
        confirmed_send_exists = False   # 已确认发送（CONFIRMED/COLLECT_FAILED）
        intent_only = False             # 仅有 INTENT（发送状态不确定=S2-R2 NEW-P1-01 整改点）
        failed_send_exists = False      # 存在失败终态（SEND_FAILED）
        for anchor_kind in ("R3_SEND_CONFIRMED", "R3_SEND_CONFIRMED_COLLECT_FAILED"):
            rec = self.ledger.state_flags().get(anchor_kind)
            if rec:
                confirmed_send_exists = True
                if rec.get("sent_user_unit_key"):
                    sent_key = rec["sent_user_unit_key"]
                    break
        if self.ledger.state_flags().get("R3_SEND_FAILED"):
            failed_send_exists = True   # 先判失败终态（S2-R3 NEW-P2-03：真实追加式账本 INTENT→FAILED 并存）
        if self.ledger.state_flags().get("R3_SEND_INTENT_RECORDED") and not confirmed_send_exists                 and not failed_send_exists:
            intent_only = True   # 仅 INTENT 且无失败终态=发送状态不确定
        cross_check_state = None   # 布尔=完成比对；字符串=显式不可比状态（绝不 None 充数）
        if sent_key is None:
            if confirmed_send_exists:
                # S2-R1 P1-01：已确认发送但发送键缺失——即便人工 attach 也不得 not_applicable
                #（发送键是归属证明的核心，缺失=无法证明回复归属本腿发送轮，fail-closed）
                raise OrchestrationError(4, "confirmed send exists but sent_user_unit_key missing "
                                            "(ownership cannot be proven; fail-closed even for manual "
                                            "attach; manual ledger forensics required)")
            if intent_only:
                # S2-R2 NEW-P1-01：INTENT-only=发送状态不确定（可能已发送）——附录 C fail-closed
                # 与附录 D A8 同源：即便人工 attach 也不得放行；须先人工核查现场并按 A8
                # 修复流程处置账本（追加 supersede 记录），之后 attach 才有意义。
                raise OrchestrationError(4, "send intent without confirmation (send state uncertain; "
                                            "fail-closed even for manual attach; run manual dispatch-dir "
                                            "forensics and repair ledger via append-only supersede first)")
            if allow_no_anchor:
                # 纯发送失败（FAILED 终态存在且无成功发送证明）或无任何发送记录后人工接管：
                # 发送责任转移到人工链——显式登记不可比状态，绝不以 None 充数。
                basis = ("leg had failed send attempts only" if failed_send_exists
                         else "leg had no send records")
                cross_check_state = (f"not_applicable_no_leg_send_anchor (manual attach path; {basis}; "
                                     "ownership ensured by manual chain)")
            else:
                raise OrchestrationError(4, "send-anchor key unavailable for ownership cross-check "
                                            "(missing/empty R3 sent_user_unit_key; fail-closed, "
                                            "None must not pass as completed cross-check)")
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
        # 采集时物化 user unit 计数实读：units-diag.json（补采）或 raw-units.json（首发）
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
        self.ledger.append({"kind": "R4_REPLY_CAPTURED", "bytes": len(raw), "reply_sha256": reply_sha,
                            "source_dir": str(reply_path.parent),
                            "marker_text": self.marker_text,
                            "located_user_unit_key": located_key,
                            "marker_hit_count": 1 if located_key else None,
                            "last_user_assert": bool(located_key),
                            "snapshot": snap,
                            # 附录 C ④采集时 user unit 计数（与发送时键身份交叉证明；
                            # 键身份一致=强于计数一致的 L-018 第 4 条归属校验口径）
                            "user_unit_counts": {
                                "at_capture_materialized": snap.get("materialized_user_count"),
                                "at_capture_evidence_class": "materialized" if snap.get("materialized_user_count") is not None else "unavailable",
                                "target_key": located_key,
                                "sent_key": sent_key,
                                "target_matches_sent_key": (located_key == sent_key)
                                if (located_key and sent_key) else cross_check_state,
                                "source": snap.get("materialized_source"),
                                "snapshot_sha256": snap.get("snapshot_sha256") if isinstance(snap, dict) else None,
                            },
                            "extracted_at": utc_now_iso(),
                            "outcome": "CAPTURED"})
        parsed = self.extract_review_json(raw.decode("utf-8", "replace"))
        if parsed.get("reviewed_commit") != self.reviewed_commit:
            raise OrchestrationError(4, f"reply reviewed_commit mismatch: {parsed.get('reviewed_commit')}")
        if parsed.get("result") not in REPLY_RESULT_ALLOWED:
            raise OrchestrationError(4, f"reply result '{parsed.get('result')}' outside "
                                        f"{sorted(REPLY_RESULT_ALLOWED)} (BLOCKED is not a content verdict; "
                                        "engine must not set task-level BLOCKED)")
        envelope = {
            "schema_version": "1.0",
            "message_id": self.message_id(),
            "message_type": "CODE_REVIEW_SUBMITTED",
            "created_at": utc_now_iso(),
            "source": {"agent_id": REVIEWER_AGENT, "agent_type": "reviewer"},
            "target": {"agent_id": ORCHESTRATOR_AGENT, "agent_type": "system"},
            "project_id": self.project_id,
            "batch_id": batch_id,   # 工作流类消息契约要求 batch_id 必填（messages-create 分支）
            "task_id": self.task_id,
            "correlation_id": self.correlation_id,
            "payload": parsed,
        }
        ajv = self.run_ajv_validation(envelope)
        if not (ajv.get("envelope", {}).get("valid") and ajv.get("request", {}).get("valid")):
            (self.run_dir / "ajv-failure.json").write_text(
                json.dumps({"envelope_input": envelope, "ajv": ajv}, ensure_ascii=False, indent=2),
                encoding="utf-8")
            raise OrchestrationError(4, f"contract validation failed (raw reply kept; no registration): "
                                        f"{json.dumps(ajv)[:400]}")
        self.ledger.append({"kind": "R4_CONTRACT_VALID", "reply_sha256": reply_sha,
                            "result": parsed.get("result"), "message_id": self.message_id(),
                            "batch_id": batch_id,
                            "ajv_envelope_errors": ajv["envelope"]["errors"],
                            "ajv_request_errors": ajv["request"]["errors"],
                            "outcome": "PASS"})
        return {"parsed": parsed, "envelope": envelope, "reply_sha256": reply_sha,
                "reply_path": reply_path, "source_dir": reply_path.parent}

    def extract_review_json(self, text: str) -> dict:
        m = re.search(r"```json\s*(\{.*?\})\s*```", text, re.S)
        if not m:
            # ChatGPT UI 可将 JSON 渲染为无围栏平衡对象（908 先例同型放宽）
            m = re.search(r"(\{[\s\S]{0,80}?[\"']result[\"'][\s\S]*\})", text)
        if not m:
            raise OrchestrationError(4, "no review JSON found in GPT-03 reply")
        try:
            parsed = json.loads(m.group(1))
        except ValueError as exc:
            raise OrchestrationError(4, f"review JSON unparsable: {exc}") from exc
        required = {"result", "summary", "reviewed_commit"}
        missing = required - set(parsed)
        if missing:
            raise OrchestrationError(4, f"review reply missing required fields: {sorted(missing)}")
        return parsed

    def run_ajv_validation(self, envelope: dict) -> dict:
        """本地 Ajv 2020 双校验：message-envelope.schema.json + messages-create 请求体
        （冻结契约文件只消费不修改，H2；scheduler 904 先例同型）。"""
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
            # $defs/request 内部 $ref=#/$defs/agent_ref 需随 $defs 一起编译（裸抽 request 分支会 MissingRef）
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
    # R5 结论登记（artifacts→messages→reports/review；附录 E 权威关系；部分成功可续）
    # P1-02：skip=账本已逐项核实的既有成功项（保留原 ID，只补缺项，不重发不覆盖）
    # P1-01：409 幂等命中=双证核验（响应指认本次键 + 账本请求指纹一致），无法证明即 fail-closed
    # ------------------------------------------------------------------
    @staticmethod
    def _req_sha(obj) -> str:
        return sha256_bytes(json.dumps(obj, ensure_ascii=False, sort_keys=True).encode("utf-8"))

    def _expected_envelope(self, task: dict, captured: dict) -> dict:
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
            if code == 200 and isinstance(art, dict) and art.get("task_id") == self.task_id \
                    and art.get("sha256") == reply_sha:
                verified.add("artifact")
        fm = flags.get("R5_MESSAGE")
        if fm and fm.get("message_id") == self.message_id() \
                and fm.get("reply_sha256") == reply_sha \
                and fm.get("canonical_sha"):
            if fm["canonical_sha"] == self._canon_sha(self._expected_envelope(task, captured)):
                verified.add("message")
        fr = flags.get("R5_REPORT")
        execution_id = (task.get("latest_execution") or {}).get("execution_id")
        if fr and fr.get("result") == captured["parsed"].get("result") \
                and fr.get("reply_sha256") == reply_sha \
                and fr.get("execution_id") == execution_id \
                and fr.get("request_sha"):
            expected_body = self._expected_report_body(
                task, captured,
                message_id=fr.get("payload_message_id") or (fm or {}).get("message_id")
                or self.message_id(),
                artifact_id=(fa or {}).get("artifact_id"))
            if fr["request_sha"] == self._req_sha(expected_body):
                verified.add("report")
        return verified

    def r5_register(self, task: dict, captured: dict, skip: frozenset[str] = frozenset()) -> dict:
        parsed, envelope = captured["parsed"], dict(captured["envelope"])
        envelope["batch_id"] = task.get("batch_id")
        result = parsed["result"]
        execution_id = (task.get("latest_execution") or {}).get("execution_id")
        out: dict[str, str | None] = {"artifact_id": None, "message_id": None, "review_report_id": None}

        # ① artifact（M1 幂等语义：路径+SHA 相同→201 duplicate:true 返回原记录；
        #            路径同 SHA 不同→409 真冲突→无幂等命中路径，fail-closed）
        ev_rel = f"runtime/review-leg/rvl-{self.run_key}/reply.txt"
        if "artifact" in skip:
            out["artifact_id"] = self.ledger.state_flags()["R5_ARTIFACT"]["artifact_id"]
            self.ledger.append({"kind": "R5_SKIP_VERIFIED", "what": "artifact",
                                "artifact_id": out["artifact_id"],
                                "evidence": "GET read-back: task+sha256 match (appendix-B GET)",
                                "outcome": "SKIP"})
        else:
            body = {"task_id": self.task_id, "type": "REVIEW_EVIDENCE",
                    "path": ev_rel, "sha256": captured["reply_sha256"]}
            code, resp = self.engine.post("/api/v1/artifacts", body)
            out["artifact_id"] = self._register_step(code, resp, (200, 201, 202), "artifact",
                                                     lambda r: str(r.get("artifact_id") or r.get("id") or ""))
            self.ledger.append({"kind": "R5_ARTIFACT", "artifact_id": out["artifact_id"],
                                "request_sha": self._req_sha(body),
                                "response_sha": self._req_sha(resp),
                                "reply_sha256": captured["reply_sha256"], "outcome": "PASS"})

        # ② message（幂等=message_id 确定性；409→双证核验）
        if "message" in skip:
            out["message_id"] = self.message_id()
            self.ledger.append({"kind": "R5_SKIP_VERIFIED", "what": "message",
                                "message_id": out["message_id"],
                                "evidence": "ledger fingerprint: message_id+reply_sha+request_sha chain",
                                "outcome": "SKIP"})
        else:
            code, resp = self.engine.post("/api/v1/messages", envelope)
            out["message_id"] = self._register_step(
                code, resp, (200, 201, 202, 409), "message",
                lambda r: str(r.get("message_id") or r.get("id") or envelope["message_id"]),
                request_sha=self._req_sha(envelope),
                canonical_sha=self._canon_sha(envelope),
                key_evidence=lambda r: (r.get("details") or {}).get("message_id") == envelope["message_id"])
            self.ledger.append({"kind": "R5_MESSAGE", "message_id": out["message_id"],
                                "message_type": envelope["message_type"],
                                "request_sha": self._req_sha(envelope),
                                "canonical_sha": self._canon_sha(envelope),
                                "response_sha": self._req_sha(resp),
                                "reply_sha256": captured["reply_sha256"], "outcome": "PASS"})

        # ③ review report（结论权威；M1 同事务推进=附录 E；幂等=(execution_id, reviewed_commit)；
        #    409→双证核验）
        report_body = {
            "task_id": self.task_id,
            "execution_id": execution_id,
            "reviewed_commit": self.reviewed_commit,
            "reviewer": REVIEWER_AGENT,
            "result": result,
            "task_package_hash": task.get("task_package_hash"),
            "base_commit": (task.get("latest_execution") or {}).get("base_commit"),
            "engineering_standard_version": task.get("engineering_standard_version"),
            "knowledge_base_commit": task.get("knowledge_base_commit"),
            "payload": {"summary": parsed.get("summary"), "issues": parsed.get("issues", []),
                        "message_id": out["message_id"], "artifact_id": out["artifact_id"],
                        "review_round": 1, "idempotency_key": self.idem_keys["idempotency_key"],
                        "reply_sha256": captured["reply_sha256"]},
        }
        if not report_body["task_package_hash"] or not report_body["base_commit"]:
            raise OrchestrationError(5, "task_package_hash/base_commit missing from task view "
                                        "(cannot register report; fail-closed)")
        if "report" in skip:
            out["review_report_id"] = self.ledger.state_flags()["R5_REPORT"].get("review_report_id")
            self.ledger.append({"kind": "R5_SKIP_VERIFIED", "what": "review report",
                                "review_report_id": out["review_report_id"],
                                "evidence": "ledger fingerprint: result+reply_sha+execution_id+request_sha chain",
                                "outcome": "SKIP"})
        else:
            code, resp = self.engine.post("/api/v1/reports/review", report_body)
            out["review_report_id"] = self._register_step(
                code, resp, (200, 201, 409), "review report",
                lambda r: str(r.get("review_report_id") or r.get("id")
                              or f"{r.get('execution_id')}@{str(r.get('reviewed_commit'))[:12]}"),
                request_sha=self._req_sha(report_body),
                key_evidence=self._report_key_evidence(execution_id),
                require_transition=True)
            self.ledger.append({"kind": "R5_REPORT", "result": result,
                                "execution_id": execution_id,
                                "request_sha": self._req_sha(report_body),
                                "response_sha": self._req_sha(resp),
                                "reply_sha256": captured["reply_sha256"],
                                "payload_message_id": report_body["payload"]["message_id"],
                                "payload_artifact_id": report_body["payload"]["artifact_id"],
                                "review_report_id": out["review_report_id"], "outcome": "PASS"})
        return out

    @staticmethod
    def _canon_sha(envelope: dict) -> str:
        """规范化指纹（剔除 created_at 元数据字段）：重启后信封重建仍可比对内容一致性。"""
        canon = {k: v for k, v in envelope.items() if k != "created_at"}
        return sha256_bytes(json.dumps(canon, ensure_ascii=False, sort_keys=True).encode("utf-8"))

    def _report_key_evidence(self, execution_id: str):
        """report 409 键精确核验：details.execution_id 结构化匹配 + message 文本按
        M1 固定格式 'review report for (<execution_id>, <commit12>..)' 正则解析，
        捕获组必须与本方 reviewed_commit[:12] 精确相等（NEW-P1-02：不匹配即非本方幂等
        键，fail-closed）。"""
        expected_commit12 = self.reviewed_commit[:12]

        def check(r) -> bool:
            if (r.get("details") or {}).get("execution_id") != execution_id:
                return False
            m = re.search(r"review report for \(" + re.escape(execution_id)
                          + r", ([0-9a-f]{12})\.\.\)", str(r.get("message", "")))
            return bool(m) and m.group(1) == expected_commit12
        return check

    def _register_step(self, code: int, resp, want: tuple[int, ...], what: str,
                       extract_id, request_sha: str | None = None,
                       canonical_sha: str | None = None,
                       key_evidence=None, require_transition: bool = False) -> str:
        if code in want and isinstance(resp, dict):
            if code == 409:
                # P1-01 双证核验：①响应必须指认本次请求键（key_evidence）；
                # ②账本须有同请求指纹（request_sha）的成功/意图记录——两证缺一即 fail-closed，
                # 禁止以通用错误字段代替幂等证明。
                if key_evidence is None or not key_evidence(resp):
                    raise OrchestrationError(5, f"{what} 409 key verification failed (response does not "
                                                f"identify our idempotency key; fail-closed): "
                                                f"{json.dumps(resp, ensure_ascii=False)[:300]}")
                kind = {"message": "R5_MESSAGE", "review report": "R5_REPORT"}.get(what)
                rec = self.ledger.state_flags().get(kind) if kind else None
                fingerprint_field = "canonical_sha" if canonical_sha is not None else "request_sha"
                expected = canonical_sha if canonical_sha is not None else request_sha
                if not rec or rec.get(fingerprint_field) != expected:
                    raise OrchestrationError(5, f"{what} 409 without matching ledger {fingerprint_field} "
                                                f"(cannot prove same-content replay; fail-closed)")
                self.ledger.append({"kind": "R5_DUPLICATE_OK", "what": what,
                                    "response_sha": self._req_sha(resp),
                                    "evidence": ["response-key-match", "ledger-request-fingerprint-match"],
                                    "outcome": "IDEMPOTENT_HIT"})
                return extract_id(resp) or "DUPLICATE-VERIFIED"
            if require_transition and resp.get("transition") is None:
                raise OrchestrationError(5, f"{what} registered but no transition applied "
                                            "(task may not be CODE_REVIEW; verify read-only, no speculative retry)")
            return extract_id(resp)
        raise OrchestrationError(5, f"{what} register HTTP {code}: "
                                    f"{json.dumps(resp, ensure_ascii=False)[:300]}")

    # ------------------------------------------------------------------
    # R6 结论推进核实（只读；M1 已在 report 事务内推进）
    # ------------------------------------------------------------------
    def r6_verify_transition(self, result: str) -> str:
        task = self._refetch_task()
        status = task.get("status")
        expected = {"PASS": "TEST_ACCEPTANCE", "REWORK": "REWORK"}[result]
        if status != expected:
            raise OrchestrationError(6, f"final status={status}, expected {expected} (result={result})")
        self.ledger.append({"kind": "R6_FINAL_STATUS", "result": result, "status": status,
                            "outcome": "PASS"})
        return status

    # ------------------------------------------------------------------
    # run：全流程（R0→R6）
    # ------------------------------------------------------------------
    def run(self) -> int:
        try:
            task = self.r0_precheck()
            self.r1_git_validate_and_pass()
            task = self._refetch_task()
            self.r2_compose_brief(task)
            dispatch_dir = self.r3_dispatch(self.run_dir.joinpath("brief.txt").read_text(encoding="utf-8"))
            captured = self.r4_capture_and_validate(dispatch_dir, batch_id=task.get("batch_id"))
            out = self.r5_register(self._refetch_task(), captured)
            status = self.r6_verify_transition(captured["parsed"]["result"])
            self._write_report({"result": "REVIEW_LEG_PASS", "final_status": status, **out,
                                "reply_sha256": captured["reply_sha256"],
                                "dispatch_dir": captured["source_dir"].name})
            print(f"RESULT=REVIEW_LEG_PASS status={status}", flush=True)
            return 0
        except OrchestrationError as exc:
            self.ledger.append({"kind": "LEG_LEVEL_BLOCKED", "step": exc.step, "reason": exc.reason,
                                "note": "M1 task status unchanged; manual takeover per appendix D",
                                "outcome": "BLOCKED_LEG"})
            self._write_report({"result": "LEG_LEVEL_BLOCKED", "failed_step": exc.step,
                                "reason": exc.reason})
            print(f"RESULT=LEG_LEVEL_BLOCKED step={exc.step} reason={exc.reason}", flush=True)
            return 2
        except (ConnectionError, OSError, ValueError, subprocess.TimeoutExpired) as exc:
            # 平台执行腿故障（§5 行5）：业务副作用类无幂等键确认前禁自动重试——一律腿级
            # BLOCKED 停等人工（fail-closed，不推测恢复）。
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
    # resume：附录 D 12 行矩阵 + 附录 C 三断点快照（fail-closed，不推测恢复）
    # ------------------------------------------------------------------
    def resume(self) -> int:
        try:
            return self._resume_inner()
        except OrchestrationError as exc:
            self.ledger.append({"kind": "LEG_LEVEL_BLOCKED", "step": exc.step, "reason": exc.reason,
                                "phase": "resume",
                                "note": "M1 task status unchanged; manual takeover per appendix D",
                                "outcome": "BLOCKED_LEG"})
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
        except Exception as exc:  # 未预期异常同样收敛为腿级 BLOCKED（忠实记录类型与现场，不静默吞）
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
        # 附录 D 行 10-12：已出 CODE_REVIEW 的状态（engine 不动）
        if status == "TEST_ACCEPTANCE":
            return self._resume_done("TEST_ACCEPTANCE", "本轮已完成，交后续测试验收流程（附录 D 行10）")
        if status == "REWORK":
            return self._resume_done("REWORK", "审查结论=返工已登记，停止自动审查（附录 D 行11）")
        if status == "BLOCKED":
            raise OrchestrationError(-1, "M1 task status=BLOCKED: engine must not touch "
                                         "(appendix D row12; OWNER only)")

        if status in ("DEV_REPORTED", "GIT_VALIDATING"):
            # 账本/M1 矛盾前置：R3 发送痕迹存在而任务尚未进入 CODE_REVIEW=不可能状态
            #（fail-closed，不推测恢复；附录 C 证据规则③）
            if any(k.startswith("R3_") for k in flags):
                raise OrchestrationError(-1, "ledger has dispatch records but M1 status="
                                         f"{status} (contradiction; fail-closed BLOCKED, no speculative recovery)")
            # 行1-4：R1 类断点。event_id 确定性 → GIT_VALIDATE 响应丢失场景同 id 重试幂等
            #（已生效则幂等返回/409-核验，不产生第二事件副作用）；PASS 前置=真实只读 Git
            # 校验（禁止假定已通过）。
            if "R1_GIT_VERIFY" not in flags:
                self.git_verify()
            self.r1_git_validate_and_pass()
            return self._continue_from_code_review(flags, allow_redispatch=False)

        if status == "CODE_REVIEW":
            # 行5-9：按账本断点分派。发送锚点=SEND_CONFIRMED 或 SEND_CONFIRMED_COLLECT_FAILED
            #（P1-03：采集失败但发送双验已过的记录同样进入原会话补采路径）
            sent_anchor = flags.get("R3_SEND_CONFIRMED") or flags.get("R3_SEND_CONFIRMED_COLLECT_FAILED")
            if sent_anchor is None:
                if any(k.startswith("R3_") for k in flags):
                    # A8：发送可能已成立而账本断裂——无法证明发送状态→停止并腿级 BLOCKED
                    #（以账本缺失为由重发=禁止；人工核查派单现场目录）
                    raise OrchestrationError(-1, "ledger has send intent without confirmation (appendix D row5 "
                                                 "vs A8: cannot prove send state -> fail-closed BLOCKED; "
                                                 "manual dispatch-dir check required; resend forbidden)")
                task = self._refetch_task()
                self.r2_compose_brief(task)
                return self._continue_from_code_review(flags, allow_redispatch=False)
            if "R4_REPLY_CAPTURED" not in flags:
                return self._resume_collect(sent_anchor)           # 行6：已发送未采集→禁重发走补采
            if "R5_REPORT" not in flags:
                return self._resume_register()                     # 行7/8：补登记（不再次触发 GPT-03）
            # 行9：M1 report 事务原子推进 ⇒ report 已登记而状态仍 CODE_REVIEW=矛盾信号
            raise OrchestrationError(-1, "ledger shows report registered but M1 status=CODE_REVIEW "
                                         "(contradiction; fail-closed BLOCKED, no speculative recovery)")
        raise OrchestrationError(-1, f"resume: unhandled M1 status {status} (appendix D matrix)")

    def _resume_collect(self, sent_anchor: dict) -> int:
        """附录 D 行6 / 断点 S1：连原 conversation UUID 补采；新建会话重发=禁止。"""
        conv_uuid = sent_anchor.get("conversation_uuid")
        sent_key = sent_anchor.get("sent_user_unit_key")
        if not conv_uuid or not sent_key:
            raise OrchestrationError(-1, "ledger missing conversation_uuid/sent_user_unit_key "
                                         "(fail-closed: cannot prove send state; manual check required)")
        if not conv_uuid or not sent_key:
            raise OrchestrationError(-1, "ledger missing conversation_uuid/sent_user_unit_key "
                                         "(fail-closed: cannot prove send state; manual check required)")
        template = Path(__file__).resolve().parent / "review_leg_recoll_template.mjs"
        # 驱动必须落在 phase0/tools 下：playwright 按脚本目录向上解析 node_modules，
        # run_dir（runtime/）不在解析链上（S2-R2 NEW-01 实测缺陷）
        driver = PHASE0_TOOLS / "review_leg_recoll_driver.mjs"
        failed_dir = DISPATCH_LOG_DIR / sent_anchor.get("dispatch_dir", "")
        if not sent_anchor.get("dispatch_dir") or not failed_dir.is_dir():
            raise OrchestrationError(-1, f"failed dispatch dir not resolvable: {failed_dir} "
                                         "(fail-closed; manual check required)")
        derive_recoll_driver(template, driver, {
            "CONV_UUID": conv_uuid,
            "SENT_USER_UNIT_KEY": sent_key,
            "FAILED_DIR": str(failed_dir).replace("\\", "/"),   # JS 字面量安全化（Windows 反斜杠=转义符）
            "OUT_DIR": str(self.run_dir).replace("\\", "/"),
            "MARKER_TEXT": self.marker_text,
            # 行6 断点定义=R4_REPLY_CAPTURED 不存在（无本轮已采集 reply 可比对）→ 前轮 SHA 排除置空
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
        """附录 D 行7/8 / 断点 S2：按原幂等键补登记（不再次触发 GPT-03）。
        P1-02：先逐项只读核实既有成功记录，保留原 ID，只补缺失项。
        重读源=账本 R4_REPLY_CAPTURED.source_dir（原采集现场，含 result/recoll 快照
        可供归属键交叉核验）；源目录已不在时回退 run_dir（reply 副本在账本 SHA 核验下）。"""
        task = self._refetch_task()
        flags = self.ledger.state_flags()
        src = (flags.get("R4_REPLY_CAPTURED") or {}).get("source_dir")
        reply_dir = Path(src) if src and Path(src).is_dir() else self.run_dir
        captured = self.r4_capture_and_validate(reply_dir, batch_id=task.get("batch_id"))
        skip = frozenset(self._ledger_verified(task, captured))
        out = self.r5_register(task, captured, skip=skip)
        status = self.r6_verify_transition(captured["parsed"]["result"])
        self._write_report({"result": "REVIEW_LEG_PASS", "final_status": status, **out,
                            "reply_sha256": captured["reply_sha256"], "resumed": True})
        print(f"RESULT=REVIEW_LEG_PASS (resumed) status={status}", flush=True)
        return 0

    def _continue_from_code_review(self, flags: dict, allow_redispatch: bool = False) -> int:
        """行1-5 类恢复的 CODE_REVIEW 接续：一次派单→采集→登记→推进（不创建第二个审查轮）。"""
        task = self._refetch_task()
        self.r2_compose_brief(task)
        dispatch_dir = self.r3_dispatch(
            self.run_dir.joinpath("brief.txt").read_text(encoding="utf-8"),
            allow_one_redispatch=allow_redispatch)
        captured = self.r4_capture_and_validate(dispatch_dir, batch_id=task.get("batch_id"))
        out = self.r5_register(self._refetch_task(), captured)
        status = self.r6_verify_transition(captured["parsed"]["result"])
        self._write_report({"result": "REVIEW_LEG_PASS", "final_status": status, **out,
                            "reply_sha256": captured["reply_sha256"], "resumed": True})
        print(f"RESULT=REVIEW_LEG_PASS (resumed) status={status}", flush=True)
        return 0

    def _resume_done(self, status: str, note: str) -> int:
        self.ledger.append({"kind": "RESUME_DONE", "status": status, "note": note, "outcome": "PASS"})
        print(f"RESULT=REVIEW_LEG_DONE status={status}", flush=True)
        return 0

    # ------------------------------------------------------------------
    # attach-reply：A6 人工退路（人工补采/人工审查回复→同一契约+同一幂等键登记）
    # ------------------------------------------------------------------
    def attach_reply(self, reply_file: Path) -> int:
        """人工经既有派单链取得审查回复后，按同一契约校验+同一幂等键登记推进。
        M1 任务状态须在 CODE_REVIEW（腿级 BLOCKED 不改 M1 状态，人工接管语义）。"""
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
        if task.get("status") != "CODE_REVIEW":
            raise OrchestrationError(-1, f"attach-reply requires CODE_REVIEW (task={task.get('status')})")
        stage_dir = self.run_dir / "manual-attach"
        stage_dir.mkdir(parents=True, exist_ok=True)
        staged = stage_dir / "reply.txt"
        staged.write_bytes(reply_file.read_bytes())
        captured = self.r4_capture_and_validate(stage_dir, batch_id=task.get("batch_id"),
                                                allow_no_anchor=True)
        skip = frozenset(self._ledger_verified(task, captured))
        out = self.r5_register(task, captured, skip=skip)
        status = self.r6_verify_transition(captured["parsed"]["result"])
        self.ledger.append({"kind": "ATTACH_REPLY_OK", "source": str(reply_file),
                            "reply_sha256": captured["reply_sha256"], "outcome": "PASS"})
        self._write_report({"result": "REVIEW_LEG_PASS", "final_status": status, **out,
                            "reply_sha256": captured["reply_sha256"], "manual_attach": True})
        print(f"RESULT=REVIEW_LEG_PASS (manual attach) status={status}", flush=True)
        return 0


# ---------------------------------------------------------------------------
# setup-agents：一次性 OWNER 引导（908 S1 bootstrap 先例同型；非 engine 运行期路径）
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
        (REVIEWER_AGENT, "reviewer", "code-review-session", False),
        (ENGINE_AGENT, "system", "review-leg-engine", True),
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
          f"tokens=runtime/review-leg/service-tokens.json (gitignored)", flush=True)
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
    ap = argparse.ArgumentParser(description="GPT-03 review leg minimal (charter v1.0)")
    sub = ap.add_subparsers(dest="cmd", required=True)

    ap_setup = sub.add_parser("setup-agents")
    ap_setup.add_argument("--m1-url", default=os.environ.get("AIEO_SCHEDULER_M1_BASE_URL",
                                                             "http://127.0.0.1:8000"))

    def common(p):
        p.add_argument("--run-key", required=True, help="digits; idempotency base (CORR-<run_key>)")
        p.add_argument("--task-id", required=True)
        p.add_argument("--project-id", required=True)
        p.add_argument("--reviewed-commit", required=True)
        p.add_argument("--diff-artifact-id", required=True)
        p.add_argument("--diff-file", required=True, type=Path)
        p.add_argument("--fixture-repo", required=True, type=Path)
        p.add_argument("--m1-url", default=os.environ.get("AIEO_SCHEDULER_M1_BASE_URL",
                                                          "http://127.0.0.1:8000"))
        p.add_argument("--token-file", type=Path, default=RUNTIME_DIR / "service-tokens.json")
        p.add_argument("--marker-text", default=None)
        p.add_argument("--brief-mode", choices=["inline", "pointer"], default="inline")
        p.add_argument("--material-repo-path", default=None,
                       help="pointer mode: material file repo-relative path (must be pushed)")
        p.add_argument("--material-base-commit", default=None,
                       help="pointer mode: baseline main full SHA containing the material file")

    common(sub.add_parser("run"))
    common(sub.add_parser("resume"))

    ap_attach = sub.add_parser("attach-reply")
    common(ap_attach)
    ap_attach.add_argument("--reply-file", required=True, type=Path)

    args = ap.parse_args(argv)
    if args.cmd == "setup-agents":
        return setup_agents(args.m1_url)

    token = load_token(args.token_file)
    leg = ReviewLeg(run_key=args.run_key, task_id=args.task_id, project_id=args.project_id,
                    reviewed_commit=args.reviewed_commit, diff_artifact_id=args.diff_artifact_id,
                    diff_file=args.diff_file, fixture_repo=args.fixture_repo,
                    m1_url=args.m1_url, token=token, marker_text=args.marker_text,
                    brief_mode=args.brief_mode, material_repo_path=args.material_repo_path,
                    material_base_commit=args.material_base_commit)
    if args.cmd == "run":
        return leg.run()
    if args.cmd == "resume":
        return leg.resume()
    if args.cmd == "attach-reply":
        return leg.attach_reply(args.reply_file)
    return 2


if __name__ == "__main__":
    sys.exit(main())
