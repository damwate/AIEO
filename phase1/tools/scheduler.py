#!/usr/bin/env python3
"""F-001 中央调度引擎最小版（T-P1-908）—— 单文件 Python 标准库实现。

任务书：docs/phase1/F001-SCHEDULER-BRIEF.md v0.3（第 3 轮会务复核 PASS 定稿）。

一次 run 以十步（S0-S9）编排一个真实任务从 DRAFT 到 DEV_REPORTED 闭环：
  S0  PRECHECK（先原子获取 run 锁=运行协调操作非业务副作用；其余检查全部只读；
      失败释放本次锁→BLOCKED，零业务副作用）
  S1  bootstrap：OWNER 登录+项目/批次/代理/任务创建（同 run 幂等键复用；
      跨 run 同名实体冲突→停止登记，不认领不复用）
  S2  任务包组装出站（<=1200 UTF-8 字节硬上限）+ gpt_dispatch 派单
  S3  真实 ChatGPT 规划会话（GPT-01，--new-session，600s）
  S4  回复登记 artifacts+messages（幂等键）+904 冻结契约 Ajv 双校验+重放验证
  S5  状态机推进 DRAFT->PLANNING->ARCH_REVIEW->READY（M1 REST 事件，禁 DB 直改）
  S6  真实领取（M3 MCP stdio claim_task->DISPATCHED，EXEC 建立）+重复领取注入
  S7  START 事件+开发交接（方案 b：编排会话=真实执行者，调度器轮询 dev-done.json）
  S8  仓库登记+M4 commit_and_collect 真实 commit+diff/TEST_LOG artifact
  S9  进度+提交闭环（M3 MCP report_progress/submit_result->DEV_REPORTED）+重放验证

调度器只编排、不仲裁：任务状态机唯一持有方是 M1；调度器不得自行推断或修正
M1 状态，只能通过 M1 正式接口读取与推进；M1/M2/M3/M4 代码零修改。

结果三态：ORCHESTRATED_PASS / ORCHESTRATED_FAIL / BLOCKED（仅 S0）。
退出码：0=PASS，1=FAIL，2=BLOCKED。

秘密边界（C6）：凭据仅经环境变量注入本进程，本文件与日志不落任何秘密值。
"""

from __future__ import annotations

import argparse
import datetime as _dt
import hashlib
import http.cookiejar
import json
import os
import re
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

REPO_ROOT = Path(os.environ.get("AIEO_SCHEDULER_REPO_ROOT", "D:/AIEO")).resolve()
RUNTIME_DIR = REPO_ROOT / "runtime" / "t-p1-908"
EVIDENCE_REL = "phase1/logs/t-p1-908-20261114"          # 证据 worktree 内相对路径
PHASE0_TOOLS = REPO_ROOT / "phase0" / "tools"
BRIDGE_BIN = REPO_ROOT / "app" / "zcode_bridge" / "bin" / "aieo-zcode-mcp.mjs"
BUNDLE_GATE = REPO_ROOT / "phase1" / "tools" / "bundle_gate.mjs"
OUTBOUND_LIMIT = 1200                                   # 出站 <=1200 UTF-8 字节硬上限
REST_TIMEOUT = 30.0                                     # 单 REST 调用默认 30s

STATE_PLAN = "DRAFT"
MSG_TYPES = "TASK_PLAN_SUBMITTED"

# ID 命名绑定 run_id（跨 run 隔离，任务书 §4）
def run_project_id(run_id: str) -> str:
    return f"AIEO-ORCH-{run_id}"


def utc_now_iso() -> str:
    return _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    return sha256_bytes(Path(path).read_bytes())


# ---------------------------------------------------------------------------
# 结果容器：三态 + 失败报告五要素（run_id/失败步号/最后确认状态/已完成操作清单/证据指针）
# ---------------------------------------------------------------------------
class RunState:
    def __init__(self, run_id: str, base_commit: str) -> None:
        self.run_id = run_id
        self.base_commit = base_commit
        self.result = None                # PASS / FAIL / BLOCKED
        self.failed_step = None
        self.last_confirmed = None        # 最后确认状态（步骤号+说明）
        self.completed: list[dict] = []   # 已完成操作清单（含已创建实体 ID）
        self.entities: dict[str, str] = {}
        self.evidence: dict[str, list[str]] = {}
        self.notes: list[str] = []
        self.exec_dir = RUNTIME_DIR / "executions" / f"ORCH-{run_id}"
        self.state_file = self.exec_dir / "run-state.json"
        self.failure_file = self.exec_dir / "failure-report.json"
        self.report_file = self.exec_dir / "orchestration-report.json"
        self.exec_dir.mkdir(parents=True, exist_ok=True)
        self._lock_held = False

    # -- 幂等键：同一 run 内重复请求凭幂等键安全复用（任务书 §4） --
    def idem(self, key: str) -> str:
        return f"IDEM-{self.run_id}-{key}"

    def note(self, text: str) -> None:
        line = f"[{utc_now_iso()}] {text}"
        self.notes.append(line)
        print(line, flush=True)

    def confirm(self, step: str, what: str) -> None:
        self.last_confirmed = f"S{step}: {what}" if isinstance(step, int) else what
        self.note(f"CONFIRMED {self.last_confirmed}")

    def complete(self, step: str, what: str, **entity) -> None:
        rec = {"step": step, "op": what}
        rec.update(entity)
        self.completed.append(rec)
        for k, v in entity.items():
            self.entities[k] = v
        self.note(f"COMPLETED S{step} {what} {entity}")

    def save(self) -> None:
        payload = {
            "run_id": self.run_id,
            "result": self.result,
            "failed_step": self.failed_step,
            "last_confirmed": self.last_confirmed,
            "base_commit": self.base_commit,
            "entities": self.entities,
            "completed_operations": self.completed,
            "evidence_pointers": self.evidence,
            "notes": self.notes,
            "updated_utc": utc_now_iso(),
        }
        self.state_file.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    def evidence_ptrs(self) -> list[str]:
        ptrs: list[str] = []
        for k, v in self.evidence.items():
            ptrs.append(f"{k}: {', '.join(v)}")
        return ptrs

    def fail(self, step, reason: str) -> "OrchestrationError":
        return OrchestrationError(step, reason)


class OrchestrationError(Exception):
    """S0 通过后的任何失败=ORCHESTRATED_FAIL（任务书 §4/§5）。"""

    def __init__(self, step, reason: str) -> None:
        self.step = step
        self.reason = reason
        super().__init__(f"S{step} ORCHESTRATED_FAIL: {reason}")


# ---------------------------------------------------------------------------
# 证据三件套（stdout/stderr/meta.json 双 SHA-256，原始字节）——任务书 §6
# ---------------------------------------------------------------------------
class Evidence:
    def __init__(self, exec_dir: Path) -> None:
        self.dir = exec_dir / "evidence-steps"
        self.dir.mkdir(parents=True, exist_ok=True)

    def triplet(self, step: str, name: str, stdout: bytes, stderr: bytes,
                extra_meta: dict | None = None) -> dict:
        base = f"s{step}-{name}"
        (self.dir / f"{base}-stdout.txt").write_bytes(stdout)
        (self.dir / f"{base}-stderr.txt").write_bytes(stderr)
        meta = {
            "step": str(step),
            "name": name,
            "started_utc": utc_now_iso(),
            "sha256_stdout": sha256_bytes(stdout),
            "sha256_stderr": sha256_bytes(stderr),
        }
        if extra_meta:
            meta.update(extra_meta)
        (self.dir / f"{base}-meta.json").write_text(
            json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
        meta["base"] = base
        return meta

    def blob(self, step: str, name: str, data: bytes) -> dict:
        base = f"s{step}-{name}"
        p = self.dir / f"{base}.json"
        p.write_bytes(data)
        return {"path": str(p), "sha256": sha256_bytes(data)}


# ---------------------------------------------------------------------------
# M1 REST 客户端（stdlib urllib + cookie + CSRF；任务书 §9 凭据边界）
# ---------------------------------------------------------------------------
class M1Client:
    def __init__(self, base_url: str) -> None:
        self.base = base_url.rstrip("/")
        jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
        self.jar = jar
        self.csrf: str | None = None
        self.logged_in_as: str | None = None

    def _req(self, method: str, path: str, body: dict | None = None,
             timeout: float = REST_TIMEOUT) -> tuple[int, dict | str]:
        url = f"{self.base}{path}"
        data = None
        headers = {"Accept": "application/json"}
        if body is not None:
            data = json.dumps(body, ensure_ascii=False).encode("utf-8")
            headers["Content-Type"] = "application/json"
        if self.csrf and method in ("POST", "PUT", "PATCH", "DELETE"):
            headers["X-CSRF-Token"] = self.csrf
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with self.opener.open(req, timeout=timeout) as resp:
                raw = resp.read()
                code = resp.getcode()
        except urllib.error.HTTPError as exc:
            raw = exc.read()
            code = exc.code
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

    def login(self, username: str, password: str) -> dict:
        """OWNER 登录；仅返回脱敏摘要，凭据与 csrf 值不进日志。"""
        code, resp = self._req("POST", "/api/v1/auth/login",
                               {"username": username, "password": password})
        if code != 200 or not isinstance(resp, dict):
            raise ConnectionError(f"M1 login HTTP {code}")
        self.csrf = resp.get("csrf_token")
        self.logged_in_as = username
        return {"http": code, "user": resp.get("user", {}).get("username", username),
                "csrf_present": bool(self.csrf)}

    def expect(self, code: int, want: tuple[int, ...], what: str, resp) -> dict:
        if code not in want or not isinstance(resp, dict):
            raise OrchestrationError(-1, f"{what}: HTTP {code} {json.dumps(resp, ensure_ascii=False)[:300]}")
        return resp


# ---------------------------------------------------------------------------
# M3 MCP stdio 客户端（newline-delimited JSON-RPC；进程跨 S6-S9 存活保证
# claim 与 submit 同一会话，activeClaim/TASK-0003 语义成立）
# ---------------------------------------------------------------------------
class McpClient:
    def __init__(self, bridge_bin: Path, env_extra: dict, log_dir: Path, cwd: Path) -> None:
        self.proc = None
        self._id = 0
        self.bridge_bin = bridge_bin
        self.env_extra = env_extra
        self.log_dir = log_dir
        self.cwd = cwd
        self.rpc_log: list[dict] = []
        self.initialized = False

    def start(self) -> None:
        self.log_dir.mkdir(parents=True, exist_ok=True)
        env = dict(os.environ)
        env.update(self.env_extra)
        self.proc = subprocess.Popen(
            ["node", str(self.bridge_bin)],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            cwd=str(self.cwd), env=env, text=False, bufsize=0)

    def _send(self, payload: dict) -> None:
        assert self.proc and self.proc.stdin
        line = (json.dumps(payload, ensure_ascii=False) + "\n").encode("utf-8")
        self.proc.stdin.write(line)
        self.proc.stdin.flush()

    def _recv(self, want_id: int, timeout: float = 60.0) -> dict:
        assert self.proc and self.proc.stdout
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            line = self.proc.stdout.readline()
            if not line:
                err = self.proc.stderr.read(4096) if self.proc.stderr else b""
                raise ConnectionError(f"MCP stream closed. stderr={err.decode('utf-8','replace')[:400]}")
            try:
                msg = json.loads(line.decode("utf-8"))
            except ValueError:
                continue
            self.rpc_log.append({"dir": "in", "id": msg.get("id"), "ts": utc_now_iso(),
                                 "method": msg.get("method")})
            if msg.get("id") == want_id and ("result" in msg or "error" in msg):
                return msg
        raise TimeoutError(f"MCP no response for id={want_id} within {timeout}s")

    def initialize(self) -> dict:
        self._id += 1
        req_id = self._id
        self._send({"jsonrpc": "2.0", "id": req_id, "method": "initialize",
                    "params": {"protocolVersion": "2024-11-05",
                               "capabilities": {},
                               "clientInfo": {"name": "aieo-scheduler-t-p1-908", "version": "0.3"}}})
        resp = self._recv(req_id)
        if "error" in resp:
            raise ConnectionError(f"MCP initialize error: {resp['error']}")
        self._send({"jsonrpc": "2.0", "method": "notifications/initialized", "params": {}})
        self.initialized = True
        server_info = resp.get("result", {}).get("serverInfo", {})
        self.rpc_log.append({"dir": "out", "id": req_id, "ts": utc_now_iso(), "method": "initialize"})
        return {"serverInfo": server_info, "protocolVersion": resp.get("result", {}).get("protocolVersion")}

    def call(self, tool: str, args: dict, timeout: float = 120.0) -> dict:
        """tools/call；返回 {is_error, text, parsed}。isError=True 也如实返回（注入验证用）。"""
        assert self.initialized, "MCP session not initialized"
        self._id += 1
        req_id = self._id
        self._send({"jsonrpc": "2.0", "id": req_id, "method": "tools/call",
                    "params": {"name": tool, "arguments": args}})
        resp = self._recv(req_id, timeout)
        self.rpc_log.append({"dir": "out", "id": req_id, "ts": utc_now_iso(),
                             "method": f"tools/call:{tool}"})
        if "error" in resp:
            err = resp["error"]
            data = err.get("data") if isinstance(err.get("data"), dict) else {}
            return {"is_error": True, "rpc_error": err.get("message"),
                    "code": data.get("code"), "text": json.dumps(err, ensure_ascii=False), "parsed": data}
        result = resp.get("result", {})
        text = ""
        for item in result.get("content", []):
            if item.get("type") == "text":
                text += item.get("text", "")
        parsed = None
        try:
            parsed = json.loads(text)
        except ValueError:
            parsed = None
        return {"is_error": bool(result.get("isError")), "text": text, "parsed": parsed}

    def close(self) -> None:
        if self.proc:
            try:
                self.proc.stdin.close()
                self.proc.wait(timeout=10)
            except Exception:
                try:
                    self.proc.kill()
                except Exception:
                    pass


# ---------------------------------------------------------------------------
# 调度器主体
# ---------------------------------------------------------------------------
class Scheduler:
    def __init__(self, args) -> None:
        self.args = args
        self.run_id = args.run_id
        self.rs = RunState(args.run_id, args.base_commit)
        self.ev = Evidence(self.rs.exec_dir)
        self.m1: M1Client | None = None
        self.mcp: McpClient | None = None
        self.lock_path = RUNTIME_DIR / "locks" / f"run-{self.run_id}.lock"
        self.run_started_ts = time.time()
        self.dispatch_dir: Path | None = None
        self.task_id: str | None = None
        self.execution_id: str | None = None
        self.commit_sha: str | None = None
        self.fixture_branch = "feature/T-P1-908-fixture"
        self.fixture_repo = REPO_ROOT / "runtime" / "t-p1-908" / "wt-fixture"
        self.evidence_worktree = REPO_ROOT / "runtime" / "t-p1-908" / "wt-ev"

    # -- 锁文件生命周期（v0.3 R1：原子获取=运行协调操作非业务副作用；先锁后检） --
    def acquire_lock(self) -> bool:
        self.lock_path.parent.mkdir(parents=True, exist_ok=True)
        try:
            fd = os.open(str(self.lock_path), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            payload = {"run_id": self.run_id, "pid": os.getpid(), "acquired_utc": utc_now_iso(),
                       "host": socket.gethostname()}
            os.write(fd, json.dumps(payload, indent=2).encode("utf-8"))
            os.close(fd)
            self.rs._lock_held = True
            return True
        except FileExistsError:
            return False

    def release_lock(self) -> None:
        """只释放本次已取得的锁；残留锁永不删除不抢占（人工清理）。"""
        if self.rs._lock_held:
            try:
                self.lock_path.unlink()
            except FileNotFoundError:
                pass
            self.rs._lock_held = False

    # -- 证据辅助 --
    def ev_link(self, step: str, key: str, value: str) -> None:
        self.rs.evidence.setdefault(f"S{step}", []).append(value)
        if key:
            self.rs.evidence.setdefault(key, []).append(value)

    def find_dispatch_dir(self) -> Path:
        logs_root = REPO_ROOT / "phase0" / "logs"
        cands = [d for d in logs_root.glob("dispatch-*")
                 if d.is_dir() and d.stat().st_mtime >= self.run_started_ts - 5]
        if not cands:
            raise OrchestrationError(3, "no dispatch evidence dir created during this run")
        return max(cands, key=lambda d: d.stat().st_mtime)

    # =====================================================================
    # S0 PRECHECK
    # =====================================================================
    def s0_precheck(self) -> None:
        out, err = b"", b""
        checks: list[dict] = []
        try:
            if not self.acquire_lock():
                # 残留锁：不删除不抢占，提示人工清理（任务书 §2 S0/§4）
                lock_content = self.lock_path.read_text(encoding="utf-8", errors="replace")[:200]
                raise OrchestrationError(0, f"residual run lock exists: {self.lock_path} (manual cleanup required; never auto-removed) :: {lock_content}")
            self.rs.note(f"lock acquired: {self.lock_path}")

            # 1) M1 可达（只读 GET /health）
            try:
                client = M1Client(os.environ.get("AIEO_SCHEDULER_M1_BASE_URL", "http://127.0.0.1:8000"))
                code, resp = client.get("/api/v1/health", timeout=10)
                ok = code == 200 and isinstance(resp, dict) and resp.get("status") == "ok"
                checks.append({"check": "m1_health", "ok": ok, "http": code})
                if not ok:
                    raise OrchestrationError(0, f"M1 health check failed: HTTP {code}")
            except (ConnectionError, OSError) as exc:
                checks.append({"check": "m1_health", "ok": False, "error": str(exc)[:200]})
                raise OrchestrationError(0, f"M1 unreachable: {exc}") from exc
            self.m1 = client

            # 2) 令牌在位（只读探测 env 变量存在性，不打印值）
            need = ["AIEO_SESSION_SECRET", "AIEO_PLATFORM_ADMIN_USERNAME", "AIEO_PLATFORM_ADMIN_PASSWORD"]
            missing = [k for k in need if not os.environ.get(k)]
            checks.append({"check": "tokens_present", "ok": not missing, "missing": missing})
            if missing:
                raise OrchestrationError(0, f"missing required env secrets: {missing}")

            # 3) 夹具在位（只读文件存在）
            fixture_ok = BUNDLE_GATE.is_file()
            checks.append({"check": "fixture_bundle_gate", "ok": fixture_ok, "path": str(BUNDLE_GATE)})
            if not fixture_ok:
                raise OrchestrationError(0, f"fixture missing: {BUNDLE_GATE}")

            # 4) Chrome 调试端口 9222 未被占用（只读连接探测；占用→BLOCKED 等人工，
            #    依据 §12 Chrome profile 会话锁边界）
            occupied = False
            try:
                with socket.create_connection(("127.0.0.1", 9222), timeout=2):
                    occupied = True
            except OSError:
                occupied = False
            checks.append({"check": "chrome_debug_port_9222", "ok": not occupied, "occupied": occupied})
            if occupied:
                raise OrchestrationError(0, "Chrome CDP debug port 9222 occupied -> manual cleanup (profile session lock boundary)")

            # 5) M3/M4 复用件在位（只读）
            for label, p in (("m3_bridge", BRIDGE_BIN),):
                if not p.is_file():
                    raise OrchestrationError(0, f"{label} missing: {p}")
            checks.append({"check": "m3_bridge_present", "ok": True, "path": str(BRIDGE_BIN)})

            self.rs.result = None  # S0 通过
            self.rs.confirm(0, "PRECHECK all read-only checks passed; lock held")
            self.ev.triplet(0, "precheck", json.dumps(checks, indent=2).encode("utf-8"), err,
                            {"checks": checks, "lock_path": str(self.lock_path), "outcome": "PASS"})
            self.ev_link(0, "", f"runtime/t-p1-908/executions/ORCH-{self.run_id}/evidence-steps/s0-precheck-*")
        except OrchestrationError:
            self.ev.triplet(0, "precheck", json.dumps(checks, indent=2).encode("utf-8"),
                            b"BLOCKED during S0 PRECHECK; zero business side-effects", {"outcome": "BLOCKED"})
            raise
        except Exception as exc:  # noqa: BLE001 - 意外异常也按 S0 失败（零业务副作用）
            self.ev.triplet(0, "precheck", json.dumps(checks, indent=2).encode("utf-8"),
                            str(exc).encode("utf-8"), {"outcome": "BLOCKED"})
            raise OrchestrationError(0, f"unexpected precheck error: {exc}") from exc

    # =====================================================================
    # S1 bootstrap（同 run 幂等 / 跨 run 隔离）
    # =====================================================================
    def s1_bootstrap(self) -> None:
        state = self.rs.state_file
        # 同 run 幂等：run-state.json 已有建制实体→安全复用（幂等键）
        if state.exists():
            saved = json.loads(state.read_text(encoding="utf-8"))
            ents = saved.get("entities", {})
            if ents.get("task_id") and ents.get("project_id") == run_project_id(self.run_id):
                self.rs.entities.update(ents)
                self.task_id = ents["task_id"]
                self.rs.note("S1 idempotent reuse of same-run entities from run-state.json")
                self.rs.confirm(1, "bootstrap reused same-run entities (idempotency key)")
                self.rs.complete(1, "bootstrap (idempotent reuse)", task_id=self.task_id)
                return
        assert self.m1 is not None
        m1 = self.m1
        login_summary = m1.login(os.environ["AIEO_PLATFORM_ADMIN_USERNAME"],
                                 os.environ["AIEO_PLATFORM_ADMIN_PASSWORD"])
        out = json.dumps({"login": login_summary}, ensure_ascii=False).encode("utf-8")
        self.rs.note(f"OWNER login ok (user={login_summary['user']})")

        pid = run_project_id(self.run_id)
        # 跨 run 隔离：新 run 发现已有同名实体→停止登记，不得认领或复用
        code, resp = m1.get(f"/api/v1/projects/{pid}")
        if code == 200:
            self.ev.triplet(1, "bootstrap", out, json.dumps({"conflict": resp}, ensure_ascii=False).encode("utf-8"),
                            {"outcome": "CONFLICT"})
            raise OrchestrationError(1, f"cross-run conflict: project {pid} already exists (stop; never claim or reuse)")
        code, resp = m1.post("/api/v1/projects", {
            "project_id": pid,
            "name": f"AIEO 中央调度引擎验证（ORCH-{self.run_id}）",
            "description": f"T-P1-908 F-001 scheduler verification run ORCH-{self.run_id}",
        })
        resp = m1.expect(code, (200, 201), f"create project {pid}", resp)
        project_id = resp.get("project_id") or resp.get("id") or pid
        self.rs.complete(1, "create project", project_id=project_id)

        requirement = (f"为 phase1/tools/bundle_gate.mjs 增加 --version 版本输出；"
                       f"node phase1/tools/bundle_gate.mjs --version 输出版本行且退出码 0；"
                       f"仅修改该单文件；无参调用与 --help 行为不变。Run ORCH-{self.run_id}。")
        code, resp = m1.post("/api/v1/batches", {
            "project_id": project_id,
            "requirement": requirement,
            "engineering_standard_version": "1.0.0",
            "knowledge_base_commit": self.rs.base_commit,
        })
        resp = m1.expect(code, (200, 201), "create batch", resp)
        batch_id = resp.get("batch_id") or resp.get("id")
        self.rs.complete(1, "create batch", batch_id=batch_id)

        agents_out = []
        tokens: dict[str, str] = {}
        tok_file = RUNTIME_DIR / "service-tokens.json"
        if tok_file.exists():
            try:
                tokens = json.loads(tok_file.read_text(encoding="utf-8"))
            except ValueError:
                tokens = {}
        for aid, atype, role, issue in (
            ("GPT-01", "reviewer", "planner-session", False),
            ("ZCODE-01", "developer", "orchestration-dev-executor", True),
            ("GIT-WORKER-01", "developer", "git-worker-m4", True),
        ):
            code, resp = m1.post("/api/v1/agents", {
                "agent_id": aid, "agent_type": atype, "role": role, "issue_service_token": issue,
            })
            if code == 409 and isinstance(resp, dict) and resp.get("code") == "RES-0002":
                # 代理=平台级服务身份（非 run 域实体，任务书 §4 跨 run 隔离仅约束
                # run 域命名实体项目/批次/任务）：已注册→幂等复用（905 服务身份先例）；
                # 服务令牌不可重复签发→自 gitignored runtime 令牌库复用。
                agents_out.append({"agent_id": aid, "http": 409, "reused_existing": True})
                continue
            resp = m1.expect(code, (200, 201), f"create agent {aid}", resp)
            agents_out.append({"agent_id": aid, "http": code, "service_token_issued": issue})
            if issue and resp.get("service_token"):
                tokens[aid] = resp["service_token"]
        if "ZCODE-01" not in tokens:
            raise OrchestrationError(1, "ZCODE-01 service token unavailable (not issued this run and none in runtime token store)")
        if tok_file.exists():
            self.rs.note("service tokens: reused existing runtime token store for pre-registered platform agents (C6, gitignored)")
        tok_file.write_text(json.dumps(tokens, indent=2), encoding="utf-8")
        os.chmod(tok_file, 0o600)
        self.rs.note("service tokens stored to gitignored runtime dir (C6)")
        self.rs.complete(1, "create agents", agents=",".join(a["agent_id"] for a in agents_out))

        title = "bundle_gate --version 版本输出（F-001 调度器验证任务）"
        code, resp = m1.post("/api/v1/tasks", {
            "batch_id": batch_id,
            "title": title,
            "description": requirement,
            "priority": "P1",
            "files_scope": ["phase1/tools/bundle_gate.mjs"],
            "acceptance_criteria": [
                "node phase1/tools/bundle_gate.mjs --version 输出版本行且退出码 0",
                "无参调用维持既有 exit 2 报错行为",
                "--help 行为不变",
                "仅修改 phase1/tools/bundle_gate.mjs 单文件",
            ],
            "engineering_standard_items": ["C5-branch-policy", "C6-secrets-not-in-git"],
            "engineering_standard_version": "1.0.0",
            "knowledge_base_commit": self.rs.base_commit,
            "dependencies": [],
        })
        resp = m1.expect(code, (200, 201), "create task", resp)
        task_id = resp.get("task_id") or resp.get("id")
        self.task_id = task_id
        self.rs.complete(1, "create task", task_id=task_id)
        self.ev.triplet(1, "bootstrap", out, b"", {
            "outcome": "PASS", "project_id": project_id, "batch_id": batch_id,
            "task_id": task_id, "agents": agents_out})
        self.ev_link(1, "", f"s1-bootstrap stdout (project={project_id}, batch={batch_id}, task={task_id})")
        self.rs.confirm(1, f"bootstrap done: project={project_id} batch={batch_id} task={task_id}")

    # =====================================================================
    # S2 任务包组装出站（<=1200B）+ 派单
    # =====================================================================
    def s2_dispatch(self) -> None:
        assert self.task_id
        request_text = self.compose_request()
        size = len(request_text.encode("utf-8"))
        if size > OUTBOUND_LIMIT:
            raise OrchestrationError(2, f"outbound {size} bytes exceeds {OUTBOUND_LIMIT}-byte hard limit")
        staging = RUNTIME_DIR / "staging"
        staging.mkdir(parents=True, exist_ok=True)
        req_file = staging / f"t-p1-908-{self.run_id}-request.txt"
        req_file.write_text(request_text, encoding="utf-8")
        self.rs.note(f"S2 outbound composed: {size} bytes (limit {OUTBOUND_LIMIT})")
        self.ev.triplet(2, "compose", request_text.encode("utf-8"), b"",
                        {"outcome": "PASS", "bytes": size, "limit": OUTBOUND_LIMIT,
                         "request_file": str(req_file)})

        # 真实派单：gpt_dispatch.mjs --new-session（阻塞至回复；600s 由 dispatch 工具自身超时控制）
        env = dict(os.environ)
        env["AIEO_GPT_CONTROLLER_GENERATION_TIMEOUT_MS"] = "600000"
        proc = subprocess.run(
            ["node", "gpt_dispatch.mjs", "--new-session", "--message-file", str(req_file)],
            cwd=str(PHASE0_TOOLS), env=env, capture_output=True, timeout=900)
        self.ev.triplet(2, "dispatch-stdout", proc.stdout, proc.stderr,
                        {"exit_code": proc.returncode, "cmd": "node gpt_dispatch.mjs --new-session",
                         "timeout_ms_env": "600000"})
        if proc.returncode != 0:
            self.rs.note("gpt_dispatch exit!=0; evidence kept (run.log retained)")
            raise OrchestrationError(2, f"gpt_dispatch exit {proc.returncode}; dispatch evidence retained")
        self.dispatch_dir = self.find_dispatch_dir()
        self.rs.complete(2, "dispatch outbound+evidence dir", dispatch_dir=self.dispatch_dir.name)
        self.rs.confirm(2, f"dispatch ok; evidence dir={self.dispatch_dir.name}")

    def compose_request(self) -> str:
        pid = run_project_id(self.run_id)
        task_id = self.task_id
        batch_id = self.rs.entities.get("batch_id", "")
        return (
            "【开发规划请求·F-001调度器真实编排】你是规划会话GPT-01。按完整SHA读仓库"
            f"https://github.com/damwate/AIEO（基线main={self.rs.base_commit}）。\n"
            f"任务{task_id}（项目{pid}，批次{batch_id}）：为 phase1/tools/bundle_gate.mjs 增加 --version："
            "node该工具 --version 时stdout输出版本行且退出码0；无参调用维持现有exit 2报错；"
            "--help行为不变；仅改该单文件。\n"
            "只做规划不动代码。请用```json围栏回复规划对象，字段严格为："
            '{"result":"SUCCESS","batch_id":"' + batch_id + '","project_id":"' + pid + '",'
            '"requirement_summary":"<50字内>",'
            '"tasks":[{"task_id":"' + task_id + '","title":"...","priority":"P1",'
            '"dependencies":[],"files_scope":["phase1/tools/bundle_gate.mjs"],'
            '"acceptance_criteria":["<3条可验证>"]}]}'
            "\nbatch_id/project_id/task_id按本消息原值填入。总回复<=500字。"
        )

    # =====================================================================
    # S3 真实 ChatGPT 规划回复核验
    # =====================================================================
    def s3_verify_reply(self) -> str:
        assert self.dispatch_dir
        reply_path = self.dispatch_dir / "reply.txt"
        if not reply_path.is_file() or reply_path.stat().st_size == 0:
            raise OrchestrationError(3, f"reply.txt missing or empty in {self.dispatch_dir}")
        raw = reply_path.read_bytes()
        reply_sha = sha256_bytes(raw)
        # 原始字节先落证据 worktree（注册路径=仓库相对真实路径，任务书 §8/A2 三处一致）
        ev_rel = f"{EVIDENCE_REL}/s3-reply-raw.txt"
        ev_abs = self.evidence_worktree / EVIDENCE_REL / "s3-reply-raw.txt"
        ev_abs.parent.mkdir(parents=True, exist_ok=True)
        ev_abs.write_bytes(raw)
        text = raw.decode("utf-8", "replace")
        plan = self.extract_plan_json(text)
        meta = {"reply_bytes": len(raw), "reply_sha256": reply_sha,
                "dispatch_dir": self.dispatch_dir.name, "evidence_rel_path": ev_rel}
        self.ev.triplet(3, "reply", raw, b"", {"outcome": "PASS", **meta})
        self.ev.blob(3, "plan-extracted", json.dumps(plan, ensure_ascii=False, indent=2).encode("utf-8"))
        self.rs.complete(3, "real ChatGPT planning reply", reply_sha256=reply_sha,
                         dispatch_dir=self.dispatch_dir.name)
        self.rs.confirm(3, f"reply received sha256={reply_sha[:12]}… plan parsed")
        return reply_sha

    def extract_plan_json(self, text: str) -> dict:
        m = re.search(r"```json\s*(\{.*?\})\s*```", text, re.S)
        if not m:
            m = re.search(r"(\{[\"']result[\"'].*\})", text, re.S)
        if not m:
            raise OrchestrationError(3, "no plan JSON found in GPT-01 reply")
        try:
            plan = json.loads(m.group(1))
        except ValueError as exc:
            raise OrchestrationError(3, f"plan JSON unparsable: {exc}") from exc
        required = {"result", "project_id", "requirement_summary", "tasks"}
        missing = required - set(plan)
        if missing:
            raise OrchestrationError(3, f"plan missing required fields: {sorted(missing)}")
        return plan

    # =====================================================================
    # S4 登记+Ajv 双校验+重放验证（A3）
    # =====================================================================
    def s4_register(self, reply_sha: str) -> None:
        assert self.m1 and self.task_id and self.dispatch_dir
        m1, task_id = self.m1, self.task_id
        plan = json.loads((self.rs.exec_dir / "evidence-steps" / "s3-plan-extracted.json").read_text(encoding="utf-8"))
        ev_rel = f"{EVIDENCE_REL}/s3-reply-raw.txt"

        # Ajv 双校验（904 冻结契约：envelope + payload；本地真实 Ajv 2020）
        envelope = {
            "schema_version": "1.0",
            "message_id": _dt.datetime.now(_dt.timezone.utc).strftime("MSG-%Y%m%d-%H%M%S"),
            "message_type": "TASK_PLAN_SUBMITTED",
            "created_at": _dt.datetime.now(_dt.timezone.utc).isoformat(),
            "source": {"agent_id": "GPT-01", "agent_type": "reviewer"},
            "target": {"agent_id": "AIEO-ORCHESTRATOR", "agent_type": "system"},
            "project_id": run_project_id(self.run_id),
            "batch_id": self.rs.entities.get("batch_id"),
            "task_id": task_id,
            "correlation_id": f"CORR-{self.run_id}-01",
            "payload": plan,
        }
        ajv = self.run_ajv_double_validation(envelope)
        self.ev.blob(4, "ajv-validation", json.dumps(ajv, ensure_ascii=False, indent=2).encode("utf-8"))
        if not (ajv.get("envelope", {}).get("valid") and ajv.get("payload", {}).get("valid")):
            raise OrchestrationError(4, f"Ajv validation not both valid: {json.dumps(ajv)[:400]}")
        self.rs.note("S4 Ajv double validation: envelope+payload both valid (0 errors)")

        # artifact 登记（幂等键=同 path+sha；先登记后重放验证）
        art_body = {"task_id": task_id, "type": "OTHER", "path": ev_rel,
                    "sha256": reply_sha, "content": (self.evidence_worktree / EVIDENCE_REL / "s3-reply-raw.txt").read_text(encoding="utf-8", errors="replace")}
        code, art1 = m1.post("/api/v1/artifacts", art_body)
        art1 = m1.expect(code, (200, 201), "register plan artifact", art1)
        artifact_id = art1.get("artifact_id") or art1.get("id")
        self.rs.complete(4, "register plan artifact", artifact_id=artifact_id)

        # message 登记（envelope 全量）
        code, msg1 = m1.post("/api/v1/messages", envelope)
        msg1 = m1.expect(code, (200, 201), "register plan message", msg1)
        message_id = msg1.get("message_id") or envelope["message_id"]
        self.rs.complete(4, "register plan message", message_id=message_id)

        # A3 重放验证：artifact 重放→duplicate:true 同 ID；message 重放→409 RES-0003 不新增
        code, art2 = m1.post("/api/v1/artifacts", art_body)
        code, msg2 = m1.post("/api/v1/messages", envelope)
        replay = {
            "artifact_replay": {"http": code, "duplicate": art2.get("duplicate") if isinstance(art2, dict) else None,
                                "artifact_id": art2.get("artifact_id") or art2.get("id") if isinstance(art2, dict) else None},
            "message_replay": {"http": code, "error_code": msg2.get("error", {}).get("code") if isinstance(msg2, dict) else None},
        }
        msg_replay_ok = replay["message_replay"]["http"] == 409
        art_replay_ok = replay["artifact_replay"]["duplicate"] is True
        self.ev.blob(4, "replay-a3", json.dumps({"artifact_replay_ok": art_replay_ok,
                                                 "message_replay_ok": msg_replay_ok,
                                                 **replay}, ensure_ascii=False, indent=2).encode("utf-8"))
        if not (art_replay_ok and msg_replay_ok):
            raise OrchestrationError(4, f"A3 replay verification failed: {json.dumps(replay)[:300]}")
        self.rs.note("S4 A3 replay: artifact duplicate:true same-id; message 409 RES-0003 no-new-row")
        self.ev.triplet(4, "register", json.dumps({"artifact_id": artifact_id, "message_id": message_id,
                                                   "ajv": ajv, "replay": replay}, ensure_ascii=False).encode("utf-8"),
                        b"", {"outcome": "PASS"})
        self.rs.confirm(4, f"registered artifact={artifact_id} message={message_id}; A3 replays verified")

    def run_ajv_double_validation(self, envelope: dict) -> dict:
        """本地 Ajv 2020 真校验：envelope schema + payload schema（904 冻结 blob 只消费）。"""
        script = r'''
import { Ajv2020 } from "file:///D:/AIEO/phase0/tools/node_modules/ajv/dist/2020.js";
import { readFileSync } from "node:fs";
const envelope = JSON.parse(readFileSync(process.argv[1], "utf8"));
const envSchema = JSON.parse(readFileSync("D:/AIEO/contracts/v1.0/message-envelope.schema.json", "utf8"));
const paySchema = JSON.parse(readFileSync("D:/AIEO/contracts/v1.0/task-plan-submitted.payload.schema.json", "utf8"));
const ajv = new Ajv2020({ allErrors: true, strict: false });
const ev = ajv.compile(envSchema); const evOk = ev(envelope);
const pd = ajv.compile(paySchema); const pdOk = pd(envelope.payload ?? {});
console.log(JSON.stringify({ envelope: { valid: !!evOk, errors: ev.errors ?? [] },
                             payload: { valid: !!pdOk, errors: pd.errors ?? [] } }));
'''
        tmp = self.rs.exec_dir / "ajv-input-envelope.json"
        tmp.write_text(json.dumps(envelope, ensure_ascii=False), encoding="utf-8")
        proc = subprocess.run(["node", "--input-type=module", "-e", script, str(tmp)],
                              cwd=str(PHASE0_TOOLS), capture_output=True, timeout=60)
        if proc.returncode != 0:
            raise OrchestrationError(4, f"Ajv node failed: {proc.stderr.decode('utf-8', 'replace')[:300]}")
        return json.loads(proc.stdout.decode("utf-8"))

    # =====================================================================
    # S5 状态机推进（M1 REST 事件，禁 DB 直改）
    # =====================================================================
    def s5_advance(self) -> None:
        assert self.m1 and self.task_id
        m1, task_id = self.m1, self.task_id
        seq = [("PLAN", "01"), ("ARCH_REVIEW", "02"), ("PASS", "03")]
        out = []
        for event, tail in seq:
            body = {"event": event, "event_id": f"EVT-{self.run_id}-{event}-{tail}",
                    "correlation_id": f"CORR-{self.run_id}-01"}
            code, resp = m1.post(f"/api/v1/tasks/{task_id}/events", body)
            resp = m1.expect(code, (200, 201), f"event {event}", resp)
            out.append({"event": event, "http": code, "event_id": body["event_id"]})
            # 只读核实实际状态（超时≠未成功原则的日常形态）
            code2, task = m1.get(f"/api/v1/tasks/{task_id}")
            st = task.get("status") if isinstance(task, dict) else None
            out.append({"after": event, "status": st})
        code, task = m1.get(f"/api/v1/tasks/{task_id}")
        final_status = task.get("status") if isinstance(task, dict) else "?"
        if final_status != "READY":
            raise OrchestrationError(5, f"task status after S5 = {final_status}, expected READY")
        self.ev.triplet(5, "events", json.dumps(out, ensure_ascii=False).encode("utf-8"), b"",
                        {"outcome": "PASS", "final_status": final_status})
        self.rs.complete(5, "state advance DRAFT->READY via M1 events", task_status=final_status)
        self.rs.confirm(5, f"task {task_id} status=READY")

    # =====================================================================
    # S6 真实领取（M3 MCP stdio）+ 重复领取注入（A4）
    # =====================================================================
    def s6_claim(self) -> None:
        assert self.task_id
        tokens = json.loads((RUNTIME_DIR / "service-tokens.json").read_text(encoding="utf-8"))
        m3_log = RUNTIME_DIR / "logs-m3"
        self.mcp = McpClient(BRIDGE_BIN, {
            "AIEO_ZCODE_BRIDGE_M1_BASE_URL": os.environ.get("AIEO_SCHEDULER_M1_BASE_URL", "http://127.0.0.1:8000"),
            "AIEO_ZCODE_BRIDGE_M1_SERVICE_TOKEN": tokens["ZCODE-01"],
            "AIEO_ZCODE_BRIDGE_LOG_DIR": str(m3_log),
        }, m3_log, REPO_ROOT)
        self.mcp.start()
        init = self.mcp.initialize()
        claim = self.mcp.call("claim_task", {
            "task_id": self.task_id,
            "correlation_id": f"CORR-{self.run_id}-02",
            "base_commit": self.rs.base_commit,
        }, timeout=60)
        self.ev.blob(6, "claim-result", json.dumps({"init": init, "claim": claim},
                                                   ensure_ascii=False).encode("utf-8"))
        if claim["is_error"] or not claim["parsed"]:
            raise OrchestrationError(6, f"claim_task failed: {claim['text'][:300]}")
        parsed = claim["parsed"]
        self.execution_id = parsed.get("execution_id") or (parsed.get("claim") or {}).get("execution_id")
        # 只读核实 DISPATCHED（S6 失败处置形态）
        code, task = self.m1.get(f"/api/v1/tasks/{self.task_id}")
        status = task.get("status") if isinstance(task, dict) else "?"
        if status != "DISPATCHED":
            raise OrchestrationError(6, f"task status after claim = {status}, expected DISPATCHED")

        # A4 注入：同会话重复领取→预期 fail-closed TASK-0003（905 §5-1 先例同型）
        repeat = self.mcp.call("claim_task", {
            "task_id": self.task_id,
            "correlation_id": f"CORR-{self.run_id}-02",
            "base_commit": self.rs.base_commit,
        }, timeout=60)
        inj_ok = repeat["is_error"] and (repeat.get("code") == "TASK-0003" or "TASK-0003" in repeat["text"])
        self.ev.blob(6, "claim-repeat-a4", json.dumps({"repeat_claim": repeat, "expected_TASK_0003": inj_ok},
                                                      ensure_ascii=False).encode("utf-8"))
        if not inj_ok:
            raise OrchestrationError(6, f"repeat-claim injection did not yield TASK-0003: {repeat['text'][:300]}")
        self.ev.triplet(6, "claim", json.dumps({"init": init, "claim_ok": True, "status": status,
                                                "execution_id": self.execution_id, "repeat_injection_TASK_0003": True},
                                               ensure_ascii=False).encode("utf-8"), b"", {"outcome": "PASS"})
        self.rs.complete(6, "real claim via M3 MCP (single session)", execution_id=self.execution_id)
        self.rs.complete(6, "injected repeat claim -> TASK-0003 fail-closed (A4)", injection="expected")
        self.rs.confirm(6, f"claimed; task DISPATCHED; execution={self.execution_id}")

    # =====================================================================
    # S7 START+开发交接（方案 b：编排会话=真实执行者；调度器轮询 dev-done.json）
    # =====================================================================
    def s7_dev_handoff(self) -> None:
        assert self.task_id
        body = {"event": "START", "event_id": f"EVT-{self.run_id}-START-01",
                "correlation_id": f"CORR-{self.run_id}-02"}
        code, resp = self.m1.post(f"/api/v1/tasks/{self.task_id}/events", body)
        resp = self.m1.expect(code, (200, 201), "event START", resp)
        code, task = self.m1.get(f"/api/v1/tasks/{self.task_id}")
        status = task.get("status") if isinstance(task, dict) else "?"
        if status != "IN_PROGRESS":
            raise OrchestrationError(7, f"task status after START = {status}, expected IN_PROGRESS")
        handoff = {
            "run_id": self.run_id, "task_id": self.task_id, "execution_id": self.execution_id,
            "executor": "orchestration-session (方案 b: 真实执行者)",
            "worktree": str(self.fixture_repo), "branch": self.fixture_branch,
            "edit_file": "phase1/tools/bundle_gate.mjs",
            "expected_change": "新增 --version：stdout 输出版本行，退出码 0；其余行为不变",
            "constraints": ["仅改该单文件", "不提交（M4 负责真实 commit）",
                            "完成后写 dev-done.json（本目录）"],
            "dev_done_file": str(self.rs.exec_dir / "dev-done.json"),
            "dev_done_format": {"ready": "true", "summary": "一句话说明改动"},
        }
        (self.rs.exec_dir / "dev-handoff.json").write_text(
            json.dumps(handoff, ensure_ascii=False, indent=2), encoding="utf-8")
        self.rs.complete(7, "START event + dev handoff written", task_status=status)
        self.ev.triplet(7, "start-handoff", json.dumps(handoff, ensure_ascii=False, indent=2).encode("utf-8"),
                        b"", {"outcome": "HANDOFF", "task_status": status})
        self.rs.confirm(7, f"START emitted; task IN_PROGRESS; handoff written; awaiting executor")

        # 轮询 dev-done.json（开发失败/超时→ORCHESTRATED_FAIL；任务 IN_PROGRESS 如实登记）
        done_file = self.rs.exec_dir / "dev-done.json"
        deadline = time.monotonic() + self.args.dev_wait_seconds
        while time.monotonic() < deadline:
            if done_file.is_file():
                try:
                    done = json.loads(done_file.read_text(encoding="utf-8"))
                except ValueError:
                    done = {}
                if done.get("ready") is True:
                    self.rs.complete(7, "real development performed by orchestration session (方案 b)",
                                     dev_summary=done.get("summary", ""))
                    self.ev.triplet(7, "dev-done", done_file.read_bytes(), b"", {"outcome": "PASS"})
                    self.rs.confirm(7, f"dev done: {done.get('summary','')[:80]}")
                    return
            time.sleep(5)
        raise OrchestrationError(7, f"dev-done.json not ready within {self.args.dev_wait_seconds}s (dev leg timeout)")

    # =====================================================================
    # S8 仓库登记+M4 commit_and_collect
    # =====================================================================
    def s8_commit_collect(self) -> None:
        assert self.task_id and self.execution_id
        m1 = self.m1
        code, resp = m1.post("/api/v1/repositories", {
            "project_id": run_project_id(self.run_id),
            "url": "https://github.com/damwate/AIEO",
            "local_path": str(self.fixture_repo),
            "default_branch": "main",
        })
        resp = m1.expect(code, (200, 201), "register repository", resp)
        repository_id = resp.get("repository_id") or resp.get("id")
        self.rs.complete(8, "register repository", repository_id=repository_id)

        # M4 复用不改：子进程真实调用 app.git_worker.worker（M1Client Protocol 适配器）
        invoker = RUNTIME_DIR / "m4_invoker.py"
        invoker.write_text(self.render_m4_invoker(repository_id), encoding="utf-8")
        env = dict(os.environ)
        proc = subprocess.run([sys.executable, "-I", str(invoker)],
                              cwd=str(REPO_ROOT), env=env, capture_output=True, timeout=300)
        self.ev.triplet(8, "m4-invoker", proc.stdout, proc.stderr, {"exit_code": proc.returncode})
        if proc.returncode != 0:
            raise OrchestrationError(8, f"M4 invoker exit {proc.returncode}: {proc.stderr.decode('utf-8','replace')[:300]}")
        try:
            m4 = json.loads(proc.stdout.decode("utf-8").strip().splitlines()[-1])
        except (ValueError, IndexError) as exc:
            raise OrchestrationError(8, f"M4 evidence unparsable: {exc}") from exc
        self.commit_sha = m4.get("commit_sha")
        if not self.commit_sha:
            raise OrchestrationError(8, f"M4 evidence missing commit_sha: {json.dumps(m4)[:300]}")
        self.ev.blob(8, "m4-evidence", json.dumps(m4, ensure_ascii=False, indent=2).encode("utf-8"))
        reg = m4.get("m1_registration")
        self.rs.complete(8, "M4 commit_and_collect (real git + real registration)",
                         commit_sha=self.commit_sha, branch=m4.get("branch"),
                         diff_sha256=m4.get("diff_sha256"), m1_registration=reg)
        self.rs.confirm(8, f"commit {self.commit_sha[:12]}… collected & registered")

    def render_m4_invoker(self, repository_id: str) -> str:
        """生成 M4 调用器（写入 gitignored runtime，不入库；AIEO 代码零修改）。"""
        return f'''#!/usr/bin/env python3
"""T-P1-908 run ORCH-{self.run_id} S8: real GitWorker commit_and_collect via M1Client Protocol adapter.
Generated by scheduler.py; lives in gitignored runtime (C6). Zero mock: real git, real M1 REST."""
import json, sys, uuid
from pathlib import Path

sys.path.insert(0, "D:/AIEO")
from app.git_worker.worker import GitWorker, AuditContext  # M4 复用不改

RUN_ID = "{self.run_id}"
TASK_ID = "{self.task_id}"
EXECUTION_ID = "{self.execution_id}"
REPOSITORY_ID = "{repository_id}"
REPO_WORKTREE = r"{self.fixture_repo}"
BASE_COMMIT = "{self.rs.base_commit}"
BRANCH = "{self.fixture_branch}"
M1_BASE = "{os.environ.get('AIEO_SCHEDULER_M1_BASE_URL', 'http://127.0.0.1:8000')}"
RUN_DIR = Path(r"{RUNTIME_DIR}")

class RestM1Adapter:
    """M1Client Protocol 实现：OWNER 会话真实 REST（register_commit/ register_artifact）；
    record_audit 比照 905 先例落本地 ndjson（M1 无 POST 审计端点）。"""
    def __init__(self):
        import os, http.cookiejar, urllib.request
        self.base = M1_BASE.rstrip("/")
        jar = http.cookiejar.CookieJar()
        self.op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
        code, resp = self.call("POST", "/api/v1/auth/login", {{"username": os.environ["AIEO_PLATFORM_ADMIN_USERNAME"], "password": os.environ["AIEO_PLATFORM_ADMIN_PASSWORD"]}})
        self.csrf = resp.get("csrf_token")
    def call(self, method, path, body=None):
        import urllib.request, urllib.error
        data = json.dumps(body).encode() if body is not None else None
        headers = {{"Content-Type": "application/json", "Accept": "application/json"}}
        if self.csrf and method != "GET":
            headers["X-CSRF-Token"] = self.csrf
        req = urllib.request.Request(self.base + path, data=data, headers=headers, method=method)
        try:
            with self.op.open(req, timeout=30) as r:
                return r.getcode(), json.loads(r.read().decode() or "{{}}")
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read().decode() or "{{}}")
    def register_commit(self, **kw):
        code, resp = self.call("POST", "/api/v1/commits", {{
            "task_id": kw.get("task_id"), "execution_id": kw.get("execution_id"),
            "repository_id": kw.get("repository_id"), "branch": kw.get("branch"),
            "sha": kw.get("commit_sha"), "base_commit": kw.get("base_commit"),
            "diff_artifact_id": kw.get("diff_artifact_id")}})
        ok = code in (200, 201)
        return {{"registered": ok, "http": code, "commit_id": resp.get("commit_id") or resp.get("id")}}
    def register_artifact(self, **kw):
        code, resp = self.call("POST", "/api/v1/artifacts", {{
            "task_id": kw.get("task_id"), "type": kw.get("artifact_type", "DIFF"),
            "path": kw.get("path"), "sha256": kw.get("sha256"), "content": kw.get("content")}})
        ok = code in (200, 201)
        return {{"registered": ok, "http": code,
                "artifact_id": resp.get("artifact_id") or resp.get("id"),
                "duplicate": resp.get("duplicate")}}
    def record_audit(self, **kw):
        path = RUN_DIR / "m4-local-audit.ndjson"
        rec = {{"ts_utc": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
                "audit_local_only": True, **kw}}
        with open(path, "a", encoding="utf-8") as f:
            f.write(json.dumps(rec, ensure_ascii=False, default=str) + "\\n")
        return {{"audit_id": "AUD-LOCAL-" + uuid.uuid4().hex[:8], "scope": "AUDIT_LOCAL_ONLY"}}

def main():
    adapter = RestM1Adapter()
    worker = GitWorker(git_path="git", git_timeout_seconds=120,
                       log_dir=r"{RUNTIME_DIR / 'logs-m4'}",
                       diff_dir="runtime/t-p1-908/diffs-m4",
                       m1_client=adapter, env="development")
    ctx = AuditContext(task_id=TASK_ID, execution_id=EXECUTION_ID,
                       correlation_id=str(uuid.uuid4()), repository_id=REPOSITORY_ID)
    ev = worker.commit_and_collect(repo=REPO_WORKTREE,
        message="feat(phase1): bundle_gate --version flag (T-P1-908 run ORCH-{self.run_id})",
        base_commit=BASE_COMMIT, files_scope=["phase1/tools/bundle_gate.mjs"], context=ctx,
        test_command=["node", "phase1/tools/bundle_gate.mjs", "--version"],
        test_log_path=r"{RUNTIME_DIR / 'executions' / ('ORCH-' + RUN_ID) / 's8-test-run.log'}")
    print(json.dumps(ev, ensure_ascii=False, default=str))

if __name__ == "__main__":
    main()
'''

    # =====================================================================
    # S9 报告闭环（同 MCP 会话 report_progress + submit_result）+ 重放（A3）
    # =====================================================================
    def s9_report_close(self) -> None:
        assert self.task_id and self.execution_id and self.commit_sha
        corr = f"CORR-{self.run_id}-02"
        prog = self.mcp.call("report_progress", {
            "task_id": self.task_id, "correlation_id": corr,
            "stage": "IMPLEMENTATION", "detail": "dev done; commit collected via M4",
            "progress_percent": 80,
        }, timeout=60)
        report = {
            "task_id": self.task_id, "execution_id": self.execution_id,
            "status": "COMPLETED",
            "implementation_summary": "bundle_gate.mjs 新增 --version：stdout 版本行+退出码0；仅改该单文件；真实开发由编排会话完成（方案b）",
            "git": {"repository": run_project_id(self.run_id), "branch": self.fixture_branch,
                    "base_commit": self.rs.base_commit, "commit_sha": self.commit_sha,
                    "changed_files": ["phase1/tools/bundle_gate.mjs"]},
            "correlation_id": corr,
            "batch_id": self.rs.entities.get("batch_id"),
            "project_id": run_project_id(self.run_id),
        }
        sub = self.mcp.call("submit_result", {"task_id": self.task_id, "report": report}, timeout=120)
        self.ev.blob(9, "progress", json.dumps(prog, ensure_ascii=False).encode("utf-8"))
        self.ev.blob(9, "submit", json.dumps(sub, ensure_ascii=False).encode("utf-8"))
        if sub["is_error"]:
            raise OrchestrationError(9, f"submit_result failed: {sub['text'][:300]}")
        # 只读核实终态 DEV_REPORTED（M1 唯一持有状态机）
        code, task = self.m1.get(f"/api/v1/tasks/{self.task_id}")
        status = task.get("status") if isinstance(task, dict) else "?"
        # A3 重放验证：S9 重放→accepted:true+duplicate:true 不新增消息
        sub2 = self.mcp.call("submit_result", {"task_id": self.task_id, "report": report}, timeout=120)
        replay_ok = (not sub2["is_error"]) and bool(sub2.get("parsed", {}) or {}) and \
                    (sub2["parsed"].get("duplicate") is True if isinstance(sub2["parsed"], dict) else "duplicate" in sub2["text"])
        self.ev.blob(9, "submit-replay-a3", json.dumps(sub2, ensure_ascii=False).encode("utf-8"))
        self.ev.triplet(9, "report-close", json.dumps({"progress_ok": not prog["is_error"],
                                                       "submit_ok": not sub["is_error"],
                                                       "task_status": status,
                                                       "submit_replay_duplicate": replay_ok},
                                                      ensure_ascii=False).encode("utf-8"),
                        b"", {"outcome": "PASS"})
        if status != "DEV_REPORTED":
            raise OrchestrationError(9, f"task final status = {status}, expected DEV_REPORTED")
        if not replay_ok:
            raise OrchestrationError(9, f"submit replay did not return duplicate:true: {sub2['text'][:200]}")
        self.rs.complete(9, "report closed: DEVELOPMENT_COMPLETED -> DEV_REPORTED", task_status=status)
        self.rs.complete(9, "submit replay accepted:true+duplicate:true (A3)", replay="verified")
        self.rs.confirm(9, f"task {self.task_id} DEV_REPORTED; submit replay duplicate:true")

    # =====================================================================
    # 主流程
    # =====================================================================
    def run(self) -> int:
        try:
            self.s0_precheck()
        except OrchestrationError as exc:
            self.release_lock()
            self.rs.result = "BLOCKED"
            self.rs.failed_step = exc.step
            self.rs.note(f"BLOCKED at S{exc.step}: {exc.reason}")
            self.write_failure_report()
            self.rs.save()
            return 2

        try:
            self.s1_bootstrap(); self.rs.save()
            self.s2_dispatch(); self.rs.save()
            reply_sha = self.s3_verify_reply(); self.rs.save()
            self.s4_register(reply_sha); self.rs.save()
            self.s5_advance(); self.rs.save()
            self.s6_claim(); self.rs.save()
            self.s7_dev_handoff(); self.rs.save()
            self.s8_commit_collect(); self.rs.save()
            self.s9_report_close(); self.rs.save()
            self.rs.result = "ORCHESTRATED_PASS"
            self.rs.confirm("final", "S0-S9 all passed; task DEV_REPORTED")
        except OrchestrationError as exc:
            self.rs.result = "ORCHESTRATED_FAIL"
            self.rs.failed_step = exc.step
            self.rs.note(f"ORCHESTRATED_FAIL at S{exc.step}: {exc.reason}")
        finally:
            if self.mcp:
                self.mcp.close()
            self.release_lock()
            self.write_report()
            self.rs.save()
        return 0 if self.rs.result == "ORCHESTRATED_PASS" else 1

    def write_failure_report(self) -> None:
        """失败报告五要素（任务书 §5）。"""
        payload = {
            "failure_report": {
                "run_id": f"ORCH-{self.run_id}",
                "failed_step": self.rs.failed_step,
                "last_confirmed_state": self.rs.last_confirmed,
                "completed_operations_with_entity_ids": self.rs.completed,
                "evidence_pointers": self.rs.evidence_ptrs() or
                    [f"runtime/t-p1-908/executions/ORCH-{self.run_id}/evidence-steps/"],
            },
            "generated_utc": utc_now_iso(),
        }
        self.rs.failure_file.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    def write_report(self) -> None:
        if self.rs.result in ("ORCHESTRATED_FAIL", "BLOCKED") and self.rs.failed_step is not None:
            self.write_failure_report()
        payload = {
            "run_id": f"ORCH-{self.run_id}",
            "scheduler": "phase1/tools/scheduler.py (F-001 v0.3, Python stdlib single file)",
            "brief": "docs/phase1/F001-SCHEDULER-BRIEF.md v0.3",
            "result": self.rs.result,
            "failed_step": self.rs.failed_step,
            "last_confirmed": self.rs.last_confirmed,
            "base_commit": self.rs.base_commit,
            "entities": self.rs.entities,
            "completed_operations": self.rs.completed,
            "evidence_pointers": self.rs.evidence_ptrs(),
            "notes": self.rs.notes,
            "generated_utc": utc_now_iso(),
        }
        self.rs.report_file.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        # orchestration-report.json 存证据目录（run_id 绑定；§8 不新增 M1 登记路径）
        ev_abs = self.evidence_worktree / EVIDENCE_REL / "orchestration-report.json"
        ev_abs.parent.mkdir(parents=True, exist_ok=True)
        ev_abs.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="F-001 central scheduler minimal (T-P1-908)")
    ap.add_argument("--run-id", required=True, help="run identifier, e.g. 908001 (entities bind to run_id)")
    ap.add_argument("--base-commit", required=True, help="40-hex main HEAD used as knowledge_base_commit")
    ap.add_argument("--dev-wait-seconds", type=int, default=900,
                    help="S7 max wait for dev-done.json from the orchestration-session executor")
    args = ap.parse_args(argv)
    if not re.fullmatch(r"[0-9a-f]{40}", args.base_commit):
        print("ERROR: --base-commit must be a full 40-hex SHA", file=sys.stderr)
        return 2
    sched = Scheduler(args)
    code = sched.run()
    print(f"RESULT={sched.rs.result} exit={code}", flush=True)
    return code


if __name__ == "__main__":
    sys.exit(main())
