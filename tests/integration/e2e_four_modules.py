"""T-P1-902 四模块集成验收 E2E 编排脚本（真实进程 + 真实 HTTP + 真实 Git）。

对应 agent-contract §7 / review-protocol §7 与 docs/立项/06 §2 验收七条：
  ① 创建项目/需求批次         → 步骤 2
  ② 手动父子任务与依赖        → 步骤 3 / 8（依赖门禁与解除）
  ③ 状态转换符合状态机        → 步骤 4-7（claim→START→DEV_REPORTED→GIT_VALIDATE→
                                CODE_REVIEW→TEST_ACCEPTANCE→ACCEPTED 全链）+ 负例
  ④ 重复消息不重复处理        → 步骤 9（message_id 幂等 / dev report 幂等 / claim 独占）
  ⑤ 后端重启状态不丢失        → 步骤 10（真实 kill + 重启 uvicorn，同 DB）
  ⑥ 进度只按 ACCEPTED 计算    → 步骤 8（board 仅计父任务 ACCEPTED）
  ⑦ 操作有审计记录            → 步骤 11（/audit 动作与 actor 断言）

模块参与方式（如实申报，DEC-017 边界）：
  M3 ZCode Bridge —— 真实 MCP stdio server 子进程 + HttpM1Client 默认 http 模式，
                      对真实 M1 服务执行 claim_task / report_progress / submit_result。
  M4 Git Worker   —— 真实 GitWorker（真实 git init/commit 于系统 temp 仓库）+
                      本目录 m1_rest_client_for_m4.py（M1Client Protocol 的 REST 实现，
                      不改 M4 模块代码）。
  M2 GPT 控制器   —— headless 全管线（本地 DOM fixture，复用模块测试夹具），经
                      本地登记簿产出 artifact，由编排侧桥接登记到真实 M1（步骤 7）。
                      M2 不直连 M1 HTTP 属申报边界（MINIMAL_LOCAL_M1_NOT_FULL_PLATFORM）。
  M1 平台基座     —— 真实 uvicorn 子进程（非 TestClient），含真实进程重启 leg。

用法：python tests/integration/e2e_four_modules.py
退出码 0 = 十一步全过；evidence JSON 全步骤 ok=true。
证据：phase1/logs/integration-<UTC 时间戳>/（e2e-evidence.json / e2e-run.log /
m1-server.log / m3-mcp-ndjson/ / m2-leg/ / m4-logs/ / dev-test-run/ / scratch 仓库留证清单）。
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import traceback
from datetime import datetime, timezone
from pathlib import Path

import httpx

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

from app.git_worker import AuditContext, GitWorker, GitWorkerError  # noqa: E402
from tests.integration.m1_rest_client_for_m4 import HttpM1ClientForM4, M1RestError  # noqa: E402
from tests.integration.mcp_stdio_client import McpStdioClient, McpStdioError  # noqa: E402

NODE_EXE = "node"
M1_STARTUP_TIMEOUT_S = 60.0
ADMIN_USERNAME = "OWNER"
ADMIN_PASSWORD = "integration-admin-pw-902"
SESSION_SECRET = "integration-e2e-session-secret-0123456789abcdef"
PROJECT_ID = "AI-IMAGE-SERVICE"
ENG_STANDARD = "platform-contract-v1.0"
KNOWLEDGE_COMMIT = "b" * 40
BRANCH_PARENT = "feature/T-P1-101-integration-e2e"


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.") + f"{datetime.now(timezone.utc).microsecond // 1000:03d}Z"


def free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def run_git(args: list[str], cwd: Path) -> str:
    proc = subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True, check=False)
    if proc.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)} 失败 (exit={proc.returncode}): {proc.stderr.strip()}")
    return proc.stdout.strip()


class M1Server:
    """真实 M1 uvicorn 子进程（临时 DB/日志/工件目录，空闲端口）。"""

    def __init__(self, work_dir: Path, run_label: str) -> None:
        self.port = free_port()
        self.base_url = f"http://127.0.0.1:{self.port}"
        self.work_dir = work_dir
        self.run_label = run_label
        self.proc: subprocess.Popen | None = None
        self.env = {
            **os.environ,
            "AIEO_ENV": "test",
            "AIEO_SESSION_SECRET": SESSION_SECRET,
            "AIEO_PLATFORM_ADMIN_PASSWORD": ADMIN_PASSWORD,
            "AIEO_PLATFORM_ADMIN_USERNAME": ADMIN_USERNAME,
            "AIEO_SERVER_BIND": f"127.0.0.1:{self.port}",
            "AIEO_DB_PATH": str(work_dir / "aieo.db"),
            "AIEO_LOG_DIR": str(work_dir / "logs"),
            "AIEO_ARTIFACT_DIR": str(work_dir / "artifacts"),
        }

    def start(self) -> None:
        log_path = self.work_dir / f"m1-server-{self.run_label}.log"
        self.log_handle = log_path.open("ab")
        self.proc = subprocess.Popen(
            [sys.executable, "-m", "app.platform.main"],
            cwd=str(REPO_ROOT),
            env=self.env,
            stdout=self.log_handle,
            stderr=subprocess.STDOUT,
        )
        deadline = time.monotonic() + M1_STARTUP_TIMEOUT_S
        last_error = ""
        while time.monotonic() < deadline:
            if self.proc.poll() is not None:
                raise RuntimeError(f"M1 进程提前退出 (exit={self.proc.returncode})，日志见 {log_path}")
            try:
                resp = httpx.get(f"{self.base_url}/api/v1/health", timeout=2.0)
                if resp.status_code == 200:
                    self.health = resp.json()
                    return
                last_error = f"health HTTP {resp.status_code}"
            except httpx.HTTPError as exc:
                last_error = str(exc)
            time.sleep(0.2)
        raise RuntimeError(f"M1 健康检查超时（{M1_STARTUP_TIMEOUT_S}s）：{last_error}")

    def stop(self) -> None:
        if self.proc and self.proc.poll() is None:
            self.proc.terminate()
            try:
                self.proc.wait(timeout=15)
            except subprocess.TimeoutExpired:
                self.proc.kill()
                self.proc.wait(timeout=10)
        if hasattr(self, "log_handle"):
            self.log_handle.close()


class HumanSession:
    """OWNER 人类会话：cookie + CSRF（C7）。"""

    def __init__(self, base_url: str) -> None:
        self.client = httpx.Client(base_url=base_url, timeout=30.0)
        self.csrf = ""

    def login(self) -> dict:
        resp = self.client.post("/api/v1/auth/login", json={
            "username": ADMIN_USERNAME, "password": ADMIN_PASSWORD,
        })
        resp.raise_for_status()
        self.csrf = resp.json()["csrf_token"]
        return resp.json()

    def post(self, path: str, json_body: dict | None = None) -> httpx.Response:
        return self.client.post(path, json=json_body, headers={"X-CSRF-Token": self.csrf})

    def get(self, path: str) -> httpx.Response:
        return self.client.get(path)

    def close(self) -> None:
        self.client.close()


class ServiceSession:
    """服务身份会话：Bearer 令牌（C7 §8.6 白名单语义）。"""

    def __init__(self, base_url: str, token: str) -> None:
        self.client = httpx.Client(
            base_url=base_url, timeout=30.0,
            headers={"Authorization": f"Bearer {token}"},
        )

    def post(self, path: str, json_body: dict | None = None) -> httpx.Response:
        return self.client.post(path, json=json_body)

    def get(self, path: str) -> httpx.Response:
        return self.client.get(path)

    def close(self) -> None:
        self.client.close()


def make_scratch_repo(repo_dir: Path) -> str:
    """构造 M4 可用的真实 git 仓库，返回基线 commit SHA（任务分支将停在其上）。

    main 在基线之后多一个探针 commit（非任务分支祖先），供 GIT-0002
    "base_commit 非祖先" 负例使用真实存在的 SHA（否则先撞 RES-0001
    GIT_COMMIT_NOT_FOUND，到不了祖先检查）。
    """
    repo_dir.mkdir(parents=True, exist_ok=True)
    run_git(["init", "-b", "main"], repo_dir)
    run_git(["config", "user.email", "integration-e2e@aieo.local"], repo_dir)
    run_git(["config", "user.name", "Integration E2E"], repo_dir)
    (repo_dir / "README.md").write_text("# integration scratch repo\n", encoding="utf-8")
    run_git(["add", "-A"], repo_dir)
    run_git(["commit", "-m", "chore(docs): integration baseline"], repo_dir)
    baseline_sha = run_git(["rev-parse", "HEAD"], repo_dir)
    (repo_dir / "PROBE.md").write_text("non-ancestor probe commit on main\n", encoding="utf-8")
    run_git(["add", "-A"], repo_dir)
    run_git(["commit", "-m", "chore(docs): non-ancestor probe on main"], repo_dir)
    return baseline_sha


class E2E:
    def __init__(self, evidence_dir: Path) -> None:
        self.evidence_dir = evidence_dir
        self.evidence_dir.mkdir(parents=True, exist_ok=True)
        self.steps: list[dict] = []
        self.work_dir = Path(tempfile.mkdtemp(prefix="aieo-int-902-"))
        self.log_path = self.evidence_dir / "e2e-run.log"

    # ---------- 记录 ----------

    def log(self, message: str) -> None:
        line = f"[{utc_now_iso()}] {message}"
        with self.log_path.open("a", encoding="utf-8") as handle:
            handle.write(line + "\n")

    def flush_evidence(self, finished: bool = False, exit_code: int | None = None) -> None:
        payload = {
            "evidence_version": "1.0",
            "task_id": "T-P1-902",
            "purpose": "T-P1-902 four-module integration acceptance E2E (agent-contract §7; 06-计划 §2 验收七条)",
            "generated_at": utc_now_iso(),
            "work_dir": str(self.work_dir),
            "steps": self.steps,
            "all_ok": all(s["ok"] for s in self.steps),
            "finished": finished,
        }
        if exit_code is not None:
            payload["exit_code"] = exit_code
        (self.evidence_dir / "e2e-evidence.json").write_text(
            json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    def step(self, name: str):
        def decorator(fn):
            def wrapper(*args, **kwargs):
                started = time.monotonic()
                self.log(f"===== STEP {name} 开始 =====")
                details: dict = {}
                try:
                    result = fn(details, *args, **kwargs)
                    duration = round(time.monotonic() - started, 3)
                    self.steps.append({"name": name, "ok": True, "duration_s": duration, "details": details})
                    self.log(f"===== STEP {name} PASS ({duration}s) =====")
                    return result
                except Exception as exc:  # noqa: BLE001 —— E2E 编排需要把任何失败记入证据
                    duration = round(time.monotonic() - started, 3)
                    self.log(f"STEP {name} FAIL: {exc}\n{traceback.format_exc()}")
                    self.steps.append({
                        "name": name, "ok": False, "duration_s": duration,
                        "error": str(exc), "traceback": traceback.format_exc()[-4000:],
                        "details": details,
                    })
                    self.flush_evidence(finished=True, exit_code=1)
                    raise SystemExit(1) from exc
            return wrapper
        return decorator

    def expect(self, condition: bool, message: str) -> None:
        if not condition:
            raise AssertionError(message)

    # ---------- 环境 ----------

    def boot_m1(self) -> M1Server:
        server = M1Server(self.work_dir, "run1")
        server.start()
        self.server = server
        self.human = HumanSession(server.base_url)
        self.human.login()
        self.log(f"M1 uvicorn 已启动 port={server.port} health={json.dumps(server.health, ensure_ascii=False)}")
        return server

    def setup_agents_and_workspace(self, details: dict) -> None:
        """agents（含服务令牌）+ 项目/仓库/批次 + 两个 scratch 仓库基线。

        AIEO-ORCHESTRATOR 由 M1 迁移 001_init.sql 启动时自播种，不在此注册；
        仅核验其存在（消息 target 合法性依赖该 agent 行）。
        """
        h = self.human
        tokens: dict[str, str] = {}
        agents: dict[str, dict] = {}
        listing = h.get("/api/v1/agents?page_size=100").json()
        seeded = [a["agent_id"] for a in listing.get("items", [])]
        self.expect("AIEO-ORCHESTRATOR" in seeded,
                    f"M1 未自播种 AIEO-ORCHESTRATOR: {seeded}")
        agents["AIEO-ORCHESTRATOR"] = {"agent_id": "AIEO-ORCHESTRATOR", "seeded": True}
        for agent_id, agent_type, role in [
            ("ZCODE-01", "developer", "ZCode executor (M3)"),
            ("REVIEWER-01", "reviewer", "Independent reviewer (M2/GPT)"),
            ("GIT-WORKER-01", "developer", "Git Worker (M4)"),
        ]:
            resp = h.post("/api/v1/agents", {
                "agent_id": agent_id, "agent_type": agent_type, "role": role,
                "issue_service_token": True,
            })
            self.expect(resp.status_code == 201, f"注册 agent {agent_id}: HTTP {resp.status_code} {resp.text[:300]}")
            agents[agent_id] = resp.json()
            token = resp.json().get("service_token")
            self.expect(bool(token), f"agent {agent_id} 未返回 service_token")
            tokens[agent_id] = token
        self.agents = agents
        self.tokens = tokens
        details["agents"] = {k: v.get("agent_id") for k, v in agents.items()}

        resp = h.post("/api/v1/projects", {"project_id": PROJECT_ID, "name": "集成验收项目",
                                           "knowledge_version": "kv-902"})
        self.expect(resp.status_code == 201, f"创建项目: {resp.status_code} {resp.text[:300]}")
        resp = h.post("/api/v1/repositories", {"project_id": PROJECT_ID,
                                               "url": "file:///integration/scratch",
                                               "local_path": str(self.work_dir / "scratch")})
        self.expect(resp.status_code == 201, f"创建仓库: {resp.status_code} {resp.text[:300]}")
        self.repository_id = resp.json()["repository_id"]
        resp = h.post("/api/v1/batches", {"project_id": PROJECT_ID, "requirement": "四模块集成验收批次",
                                          "engineering_standard_version": ENG_STANDARD,
                                          "knowledge_base_commit": KNOWLEDGE_COMMIT})
        self.expect(resp.status_code == 201, f"创建批次: {resp.status_code} {resp.text[:300]}")
        self.batch_id = resp.json()["batch_id"]
        details["project_id"] = PROJECT_ID
        details["repository_id"] = self.repository_id
        details["batch_id"] = self.batch_id

        self.zcode = ServiceSession(self.server.base_url, tokens["ZCODE-01"])
        self.reviewer = ServiceSession(self.server.base_url, tokens["REVIEWER-01"])
        self.git_worker_session = ServiceSession(self.server.base_url, tokens["GIT-WORKER-01"])

        self.parent_repo_dir = self.work_dir / "scratch" / "parent"
        self.parent_base_sha = make_scratch_repo(self.parent_repo_dir)
        # 任务分支从基线 commit 建出（main 顶端的探针 commit 保持非祖先）
        run_git(["switch", "-c", BRANCH_PARENT, self.parent_base_sha], self.parent_repo_dir)
        self.child_repo_dir = self.work_dir / "scratch" / "child"
        self.child_base_sha = make_scratch_repo(self.child_repo_dir)
        run_git(["switch", "-c", "feature/T-P1-102-child-task", self.child_base_sha], self.child_repo_dir)
        details["parent_base_sha"] = self.parent_base_sha
        details["child_base_sha"] = self.child_base_sha

    def create_tasks(self, details: dict) -> None:
        """验收②：手动父子任务与依赖（父 weight=2，子 weight=1）。"""
        h = self.human
        resp = h.post("/api/v1/tasks", {
            "batch_id": self.batch_id, "title": "集成验收父任务：平台契约核心链路",
            "priority": "P1", "weight": 2.0, "files_scope": ["src/"],
            "acceptance_criteria": ["四模块交互端到端", "验收七条全过"],
            "engineering_standard_items": [], "engineering_standard_version": ENG_STANDARD,
            "knowledge_base_commit": KNOWLEDGE_COMMIT, "dependencies": [],
        })
        self.expect(resp.status_code == 201, f"创建父任务: {resp.status_code} {resp.text[:300]}")
        self.parent_task_id = resp.json()["task_id"]
        self.parent_package_hash = resp.json().get("task_package_hash")
        resp = h.post("/api/v1/tasks", {
            "batch_id": self.batch_id, "parent_id": self.parent_task_id,
            "title": "集成验收子任务：依赖父任务", "priority": "P2", "weight": 1.0,
            "files_scope": ["src/"], "acceptance_criteria": ["依赖解除后可领取"],
            "engineering_standard_items": [], "engineering_standard_version": ENG_STANDARD,
            "knowledge_base_commit": KNOWLEDGE_COMMIT,
            "dependencies": [self.parent_task_id],
        })
        self.expect(resp.status_code == 201, f"创建子任务: {resp.status_code} {resp.text[:300]}")
        self.child_task_id = resp.json()["task_id"]
        # 父任务推进到 READY；子任务只推进到 ARCH_REVIEW——依赖门禁同样约束
        # PASS→READY 转换（父未 ACCEPTED 时子任务无法就绪），依赖解除在步骤 8 闭环。
        for event in ("PLAN", "ARCH_REVIEW", "PASS"):
            resp = h.post(f"/api/v1/tasks/{self.parent_task_id}/events", {
                "event": event, "event_id": f"EVT-SETUP-{self.parent_task_id}-{event}",
            })
            self.expect(resp.status_code == 200,
                        f"父任务事件 {event}: {resp.status_code} {resp.text[:300]}")
        for event in ("PLAN", "ARCH_REVIEW"):
            resp = h.post(f"/api/v1/tasks/{self.child_task_id}/events", {
                "event": event, "event_id": f"EVT-SETUP-{self.child_task_id}-{event}",
            })
            self.expect(resp.status_code == 200,
                        f"子任务事件 {event}: {resp.status_code} {resp.text[:300]}")
        details["parent_task_id"] = self.parent_task_id
        details["child_task_id"] = self.child_task_id
        details["parent_package_hash"] = self.parent_package_hash
        details["parent_status_after_setup"] = h.get(f"/api/v1/tasks/{self.parent_task_id}").json()["status"]
        details["child_dependencies"] = h.get(f"/api/v1/tasks/{self.child_task_id}/dependencies").json()

    # ---------- 步骤 ----------

    def step_boot_and_setup(self, details: dict) -> None:
        self.boot_m1()
        self.setup_agents_and_workspace(details)
        self.create_tasks(details)

    def step_dependency_gate(self, details: dict) -> None:
        """验收②/③负例：父未 ACCEPTED 时子任务被依赖门禁挡住（PASS→READY 与 claim 双落点）。"""
        # ① 子任务 PASS→READY 转换被依赖门禁拒绝：409 TASK-0002（pending_dependencies 指向父任务）
        resp = self.human.post(f"/api/v1/tasks/{self.child_task_id}/events", {
            "event": "PASS", "event_id": "EVT-NEG-CHILD-PASS-DEP",
        })
        self.expect(resp.status_code == 409, f"依赖未满足的 PASS 应 409，实际 {resp.status_code}: {resp.text[:300]}")
        payload = resp.json()
        self.expect(payload.get("code") == "TASK-0002", f"期望 TASK-0002: {payload}")
        pending = payload.get("details", {}).get("pending_dependencies")
        self.expect(pending and pending[0]["task_id"] == self.parent_task_id,
                    f"pending_dependencies 应指向父任务: {pending}")
        details["child_pass_blocked_by_dependency"] = payload
        details["pending_dependencies"] = pending

        # ② 子任务 claim（非 READY 状态）→ 409 TASK-0001 invalid_transition
        resp = self.zcode.post(f"/api/v1/tasks/{self.child_task_id}/claim", {
            "agent_id": "ZCODE-01", "base_commit": self.child_base_sha,
            "correlation_id": "CORR-90201",
        })
        self.expect(resp.status_code == 409 and resp.json().get("code") == "TASK-0001",
                    f"非 READY claim 应 TASK-0001: {resp.status_code} {resp.text[:300]}")
        details["child_claim_blocked_not_ready"] = resp.json()

        # ③ 父任务 READY 上提交 PASS（非法转换）→ 409 TASK-0001
        resp = self.human.post(f"/api/v1/tasks/{self.parent_task_id}/events", {
            "event": "PASS", "event_id": "EVT-NEG-PASS-FROM-READY",
        })
        self.expect(resp.status_code == 409 and resp.json().get("code") == "TASK-0001",
                    f"READY 上 PASS 应 TASK-0001: {resp.status_code} {resp.text[:300]}")
        details["invalid_transition_negative"] = resp.json()

    def start_mcp_server(self) -> McpStdioClient:
        env = {
            **os.environ,
            "AIEO_ENV": "test",
            "AIEO_ZCODE_BRIDGE_M1_MODE": "http",
            "AIEO_ZCODE_BRIDGE_M1_BASE_URL": self.server.base_url,
            "AIEO_ZCODE_BRIDGE_M1_SERVICE_TOKEN": self.tokens["ZCODE-01"],
            "AIEO_ZCODE_BRIDGE_LOG_DIR": str(self.evidence_dir / "m3-mcp-ndjson"),
            "AIEO_ZCODE_BRIDGE_SESSION_ID": "SES-INT-902-A",
        }
        client = McpStdioClient(
            [NODE_EXE, str(REPO_ROOT / "app" / "zcode_bridge" / "bin" / "aieo-zcode-mcp.mjs")],
            env=env, cwd=str(REPO_ROOT / "app" / "zcode_bridge"), timeout_s=30.0,
        )
        handshake = client.initialize()
        self.expect(handshake.get("serverInfo", {}).get("name") == "aieo-zcode-bridge",
                    f"MCP 握手 serverInfo 不符: {handshake}")
        self.expect(client.tools_list() == ["claim_task", "report_progress", "submit_result"],
                    f"MCP tools/list 不符: {client.tools_list()}")
        return client

    def step_m3_claim_and_progress(self, details: dict) -> None:
        """M3 leg（上）：真实 MCP stdio → HttpM1Client → 真实 M1 claim + 进度上报。"""
        self.mcp = self.start_mcp_server()
        details["mcp_handshake"] = "aieo-zcode-bridge"

        res = self.mcp.call_tool("claim_task", {
            "task_id": self.parent_task_id, "correlation_id": "CORR-90210",
            "base_commit": self.parent_base_sha,
        })
        self.expect(not res["isError"], f"claim_task 失败: {json.dumps(res['payload'], ensure_ascii=False)[:400]}")
        claimed = res["payload"]
        # M3 claim payload: {accepted, session_id, task: <HTTP body>, message_ack}；
        # HTTP body = {task: <任务视图>, execution_id, attempt, transition, dispatch_message_id}
        self.execution_id = claimed["task"]["execution_id"]
        self.expect(claimed["task"]["task"]["status"] == "DISPATCHED",
                    f"claim 后状态应 DISPATCHED: {claimed['task']['task']['status']}")
        details["claim"] = {"execution_id": self.execution_id,
                            "status": claimed["task"]["task"]["status"]}

        # 重复领取（独占租约）→ M1 409 TASK-0003（经 REST 直发，同服务身份）
        resp = self.zcode.post(f"/api/v1/tasks/{self.parent_task_id}/claim", {
            "agent_id": "ZCODE-01", "base_commit": self.parent_base_sha,
            "correlation_id": "CORR-90211",
        })
        self.expect(resp.status_code == 409 and resp.json().get("code") == "TASK-0003",
                    f"重复 claim 应 TASK-0003: {resp.status_code} {resp.text[:300]}")
        details["duplicate_claim"] = resp.json()

        # 编排侧补 START（M1 claim 只到 DISPATCHED；dev report 要求 IN_PROGRESS）
        resp = self.zcode.post(f"/api/v1/tasks/{self.parent_task_id}/events", {
            "event": "START", "event_id": "EVT-START-PARENT", "correlation_id": "CORR-90210",
        })
        self.expect(resp.status_code == 200 and resp.json()["to_status"] == "IN_PROGRESS",
                    f"START 事件: {resp.status_code} {resp.text[:300]}")
        details["start_transition"] = resp.json()

        # report_progress（claim 未返回 project_id → 显式携带上下文，M3 契约允许）
        res = self.mcp.call_tool("report_progress", {
            "task_id": self.parent_task_id, "correlation_id": "CORR-90210",
            "stage": "implementing", "detail": "集成验收 M3 leg 进行中", "progress_percent": 50,
            "project_id": PROJECT_ID, "batch_id": self.batch_id,
        })
        self.expect(not res["isError"], f"report_progress 失败: {json.dumps(res['payload'], ensure_ascii=False)[:400]}")
        self.expect(res["payload"]["delivered"] is True, f"进度消息未投递: {res['payload']}")
        details["progress_message_id"] = res["payload"]["message_id"]
        self.progress_message_id = res["payload"]["message_id"]

    def step_m4_commit_and_collect(self, details: dict) -> None:
        """M4 leg：真实 GitWorker + REST M1 客户端 → 真实 git commit + DIFF 工件/commit/审计登记。"""
        m4_log_dir = self.work_dir / "m4-logs"
        m4_diff_dir = self.work_dir / "m4-diffs"
        m4 = GitWorker(log_dir=m4_log_dir, diff_dir=m4_diff_dir,
                       m1_client=self.build_m4_rest_client(), env="test")
        self.m4_rest_client = m4.m1_client
        context = AuditContext(task_id=self.parent_task_id, execution_id=self.execution_id,
                               correlation_id="CORR-90210", repository_id=self.repository_id)

        # 负例：base_commit 非祖先 → GIT-0002 fail-closed（不产生 commit）。
        # 用 main 上的真实探针 commit（非任务分支祖先）——不存在的 SHA 会先撞
        # RES-0001 GIT_COMMIT_NOT_FOUND，到不了祖先检查。
        (self.parent_repo_dir / "src").mkdir(exist_ok=True)
        (self.parent_repo_dir / "src" / "impl.py").write_text("VALUE = 1\n", encoding="utf-8")
        probe_sha = run_git(["rev-parse", "main"], self.parent_repo_dir)
        try:
            m4.commit_and_collect(self.parent_repo_dir, "feat(git_worker): integration e2e commit",
                                  base_commit=probe_sha, files_scope=["src/"], context=context)
            raise AssertionError("非祖先 base_commit 应触发 GIT-0002")
        except GitWorkerError as err:
            self.expect(err.code == "GIT-0002", f"期望 GIT-0002，实际 {err.code}: {err.message}")
            details["base_mismatch_negative"] = {"code": err.code, "message": err.message}
        head_before = run_git(["rev-parse", "HEAD"], self.parent_repo_dir)
        self.expect(head_before == self.parent_base_sha, "GIT-0002 负例不得产生 commit")

        # 正例：真实 commit + M1 登记（DIFF 工件 → git_commit → 本地 audit NDJSON）
        (self.parent_repo_dir / "src" / "impl.py").write_text("VALUE = 42  # integration e2e\n", encoding="utf-8")
        evidence = m4.commit_and_collect(self.parent_repo_dir, "feat(git_worker): integration e2e commit",
                                         base_commit=self.parent_base_sha, files_scope=["src/"],
                                         context=context)
        self.expect(evidence["m1_registration"]["status"] == "REGISTERED",
                    f"M1 登记未 REGISTERED: {json.dumps(evidence.get('m1_registration'), ensure_ascii=False)[:400]}")
        self.commit_sha = evidence["commit_sha"]
        self.diff_artifact_id = evidence["m1_registration"]["artifact_id"]
        self.m4_git_commit_id = evidence["m1_registration"]["git_commit_id"]
        details["commit_sha"] = self.commit_sha
        details["m1_registration"] = evidence["m1_registration"]
        details["changed_files"] = evidence["changed_files"]
        details["diff_sha256"] = evidence["diff_sha256"]

        # 工件幂等：同 path 同 sha 重复登记 → duplicate=true
        # （path 必须与 M4 登记的身份路径逐字节一致：git-worker/diffs/<task>/diff-<sha>.patch）
        payload = self.git_worker_session.post("/api/v1/artifacts", {
            "task_id": self.parent_task_id, "type": "DIFF",
            "path": f"git-worker/diffs/{self.parent_task_id}/diff-{self.commit_sha}.patch",
            "sha256": evidence["diff_sha256"],
        }).json()
        self.expect(payload.get("duplicate") is True,
                    f"同 path 同 sha 工件应幂等返回 duplicate=true: {payload}")
        details["artifact_duplicate_idempotent"] = payload["artifact_id"]

        # commit 幂等：UNIQUE(repository_id, sha)
        dup = self.m4_rest_client.register_commit(
            task_id=self.parent_task_id, execution_id=self.execution_id,
            repository_id=self.repository_id, branch=BRANCH_PARENT, sha=self.commit_sha,
            base_commit=self.parent_base_sha, diff_artifact_id=self.diff_artifact_id)
        details["commit_duplicate_idempotent"] = dup

        # TEST_LOG 工件（供 dev report / test report 引用）——真实测试执行的字节留证，
        # 非人工构造字符串（F-802 整改）：此处实跑一次真实 pytest（M1 授权模块测试），
        # 工件内容 = 该进程输出的原始字节，dev report 统计从同一输出解析，登记后回读
        # 验证内容与 SHA-256 一致——测试证据可完整追溯到同一次真实执行。
        devtest_dir = self.evidence_dir / "dev-test-run"
        devtest_dir.mkdir(parents=True, exist_ok=True)
        devtest_cmd = [sys.executable, "-m", "pytest", "tests/platform/test_service_authorization.py",
                       "-q", "--no-header", "-p", "no:cacheprovider"]
        devtest = subprocess.run(devtest_cmd, cwd=str(REPO_ROOT), capture_output=True,
                                 text=True, encoding="utf-8", errors="replace", timeout=300)
        devtest_log = (devtest.stdout or "") + (devtest.stderr or "")
        devtest_log_path = devtest_dir / "devtest-run.log"
        with open(devtest_log_path, "w", encoding="utf-8", newline="") as fh:
            fh.write(devtest_log)
        m_pass = re.search(r"(\d+) passed", devtest_log)
        m_fail = re.search(r"(\d+) failed", devtest_log)
        devtest_passed = int(m_pass.group(1)) if m_pass else 0
        devtest_failed = int(m_fail.group(1)) if m_fail else 0
        self.expect(devtest.returncode == 0 and devtest_passed > 0 and devtest_failed == 0,
                    f"开发侧真实测试执行失败 exit={devtest.returncode}: {devtest_log[-600:]}")
        devtest_sha = hashlib.sha256(devtest_log.encode("utf-8")).hexdigest()
        details["dev_test_run"] = {"command": " ".join(devtest_cmd), "exit_code": devtest.returncode,
                                   "passed": devtest_passed, "failed": devtest_failed,
                                   "log_file": "dev-test-run/devtest-run.log", "log_sha256": devtest_sha}
        self.dev_test_stats = {"commands": [" ".join(devtest_cmd)],
                               "passed": devtest_passed, "failed": devtest_failed}
        resp = self.git_worker_session.post("/api/v1/artifacts", {
            "task_id": self.parent_task_id, "type": "TEST_LOG",
            "path": f"phase1/logs/integration/m4-test-logs/e2e-{self.execution_id}.log",
            "sha256": devtest_sha,
            "content": devtest_log,
        })
        self.expect(resp.status_code == 201, f"TEST_LOG 工件登记: {resp.status_code} {resp.text[:300]}")
        self.test_log_artifact_id = resp.json()["artifact_id"]
        details["test_log_artifact_id"] = self.test_log_artifact_id

        # 回读验证：M1 存储内容与本次真实执行字节 SHA-256 一致（证据可追溯闭环）
        fetched = self.git_worker_session.get(f"/api/v1/artifacts/{self.test_log_artifact_id}")
        self.expect(fetched.status_code == 200, f"TEST_LOG 回读: {fetched.status_code}")
        self.expect(fetched.json().get("content") == devtest_log,
                    "TEST_LOG 回读内容与真实执行输出不一致")
        self.expect(hashlib.sha256(fetched.json()["content"].encode("utf-8")).hexdigest() == devtest_sha,
                    "TEST_LOG 回读内容 SHA-256 与登记值不一致")
        details["test_log_readback"] = {"content_identical": True, "sha256_match": True}

        # 工件哈希不匹配负例：422 ART-0002 ARTIFACT_HASH_MISMATCH（inline content 与 sha256 不符）
        resp = self.git_worker_session.post("/api/v1/artifacts", {
            "task_id": self.parent_task_id, "type": "OTHER", "path": "phase1/logs/integration/m4-logs/bad.log",
            "sha256": "a" * 64, "content": "content-does-not-match",
        })
        self.expect(resp.status_code == 422 and resp.json().get("code") == "ART-0002",
                    f"哈希不匹配应 422 ART-0002: {resp.status_code} {resp.text[:300]}")
        details["hash_mismatch_negative"] = resp.json()

    def build_m4_rest_client(self) -> HttpM1ClientForM4:
        return HttpM1ClientForM4(
            base_url=self.server.base_url,
            service_token=self.tokens["GIT-WORKER-01"],
            audit_log_path=self.evidence_dir / "m4-audit-local.ndjson",
        )

    def step_m3_submit_result(self, details: dict) -> None:
        """M3 leg（下）：submit_result（开发报告 → DEV_REPORTED）+ 幂等负例。"""
        report = {
            "task_id": self.parent_task_id,
            "execution_id": self.execution_id,
            "status": "COMPLETED",
            "implementation_summary": "集成验收核心链路实现完成",
            "git": {
                "repository": PROJECT_ID,
                "branch": BRANCH_PARENT,
                "base_commit": self.parent_base_sha,
                "commit_sha": self.commit_sha,
                "changed_files": ["src/impl.py"],
            },
            "tests": {"executed": True, "commands": self.dev_test_stats["commands"],
                      "passed": self.dev_test_stats["passed"], "failed": self.dev_test_stats["failed"],
                      "log_artifact_id": self.test_log_artifact_id},
            "known_issues": [],
            "knowledge_updates_required": False,
            "self_assessment": "集成验收 M3 leg 提交，等待独立审查",
            "correlation_id": "CORR-90210",
            "batch_id": self.batch_id,
        }
        res = self.mcp.call_tool("submit_result", {"report": report})
        self.expect(not res["isError"], f"submit_result 失败: {json.dumps(res['payload'], ensure_ascii=False)[:400]}")
        payload = res["payload"]
        self.expect(payload["report_registry"]["registered"] is True, f"开发报告未登记: {payload}")
        details["submit_result"] = {"dev_report_id": payload["report_registry"]["dev_report_id"],
                                    "message_id": payload["message_ack"]["message_id"]}
        self.dev_completed_message_id = payload["message_ack"]["message_id"]

        # 任务状态应已 DEV_REPORTED（M1 register_dev_report 触发 DEVELOPMENT_COMPLETED）
        status = self.human.get(f"/api/v1/tasks/{self.parent_task_id}").json()["status"]
        self.expect(status == "DEV_REPORTED", f"submit_result 后应 DEV_REPORTED，实际 {status}")
        details["task_status_after_submit"] = status

        # 幂等负例：同一报告重复提交 → duplicate=true，不产生第二条消息
        res2 = self.mcp.call_tool("submit_result", {"report": report})
        self.expect(not res2["isError"], f"重复 submit_result 应幂等: {json.dumps(res2['payload'], ensure_ascii=False)[:400]}")
        self.expect(res2["payload"]["report_registry"]["duplicate"] is True,
                    f"重复报告应 duplicate=true: {res2['payload']}")
        self.expect(res2["payload"]["message_ack"].get("skipped") is True,
                    f"重复报告不得再投递 DEVELOPMENT_COMPLETED: {res2['payload']['message_ack']}")
        details["duplicate_submit_result"] = res2["payload"]["report_registry"]

    def step_git_validate_and_accept(self, details: dict) -> None:
        """验收③：GIT_VALIDATE→PASS→CODE_REVIEW→review report(PASS)→TEST_ACCEPTANCE→test report(PASS+EXECUTED_PASS)→ACCEPTED。"""
        h = self.human

        # ACCEPTED 证据门负例（F-801 整改：必须真实命中门禁，而非止步于执行存在性校验）：
        # 父任务持真实 execution_id（claim 建立的有效执行），当前 DEV_REPORTED——尚未经
        # review PASS 证据链，绝无 TEST_ACCEPTANCE 状态。此时提交 EXECUTED_PASS 的 test
        # report，请求应通过 _require_execution 校验后命中状态门禁，精确 409 TASK-0001。
        resp = self.reviewer.post("/api/v1/reports/test", {
            "task_id": self.parent_task_id, "execution_id": self.execution_id,
            "commit_sha": self.commit_sha, "execution_result": "EXECUTED_PASS", "result": "PASS",
        })
        self.expect(resp.status_code == 409 and resp.json().get("code") == "TASK-0001",
                    f"TEST_ACCEPTANCE 之前的 test report 应 409 TASK-0001: {resp.status_code} {resp.text[:300]}")
        self.expect("requires TEST_ACCEPTANCE" in resp.json().get("message", ""),
                    f"拒绝原因应指明 TEST_ACCEPTANCE 门禁: {resp.json().get('message')}")
        details["accepted_evidence_gate_negative"] = {
            "status_code": resp.status_code, "code": resp.json().get("code"),
            "message": resp.json().get("message"), "task_status_at_attempt": "DEV_REPORTED",
            "execution_id": self.execution_id,
        }
        for event in ("GIT_VALIDATE", "PASS"):
            resp = h.post(f"/api/v1/tasks/{self.parent_task_id}/events", {
                "event": event, "event_id": f"EVT-GIT-{event}", "correlation_id": "CORR-90210",
            })
            self.expect(resp.status_code == 200, f"{event} 事件: {resp.status_code} {resp.text[:300]}")
        details["after_git_pass"] = h.get(f"/api/v1/tasks/{self.parent_task_id}").json()["status"]
        self.expect(details["after_git_pass"] == "CODE_REVIEW",
                    f"GIT_VALIDATE+PASS 后应 CODE_REVIEW: {details['after_git_pass']}")

        resp = self.reviewer.post("/api/v1/reports/review", {
            "task_id": self.parent_task_id, "execution_id": self.execution_id,
            "reviewed_commit": self.commit_sha, "reviewer": "REVIEWER-01", "result": "PASS",
            "task_package_hash": self.parent_package_hash, "base_commit": self.parent_base_sha,
            "engineering_standard_version": ENG_STANDARD, "knowledge_base_commit": KNOWLEDGE_COMMIT,
        })
        self.expect(resp.status_code == 201, f"review report: {resp.status_code} {resp.text[:400]}")
        details["review_report"] = resp.json()
        status = h.get(f"/api/v1/tasks/{self.parent_task_id}").json()["status"]
        self.expect(status == "TEST_ACCEPTANCE", f"review PASS 后应 TEST_ACCEPTANCE，实际 {status}")

        resp = h.post("/api/v1/reports/test", {
            "task_id": self.parent_task_id, "execution_id": self.execution_id,
            "commit_sha": self.commit_sha, "execution_result": "EXECUTED_PASS",
            "result": "PASS", "artifact_id": self.test_log_artifact_id,
        })
        self.expect(resp.status_code == 201, f"test report: {resp.status_code} {resp.text[:400]}")
        details["test_report"] = resp.json()
        status = h.get(f"/api/v1/tasks/{self.parent_task_id}").json()["status"]
        self.expect(status == "ACCEPTED", f"test PASS+EXECUTED_PASS 后应 ACCEPTED，实际 {status}")
        details["final_status"] = status

    def step_m2_leg_and_bridge(self, details: dict) -> None:
        """M2 leg：headless 全管线 + 本地登记簿 → 编排侧桥接登记真实 M1 + 回读比对。"""
        m2_out_dir = self.evidence_dir / "m2-leg"
        m2_out_dir.mkdir(parents=True, exist_ok=True)
        proc = subprocess.run(
            [NODE_EXE, str(REPO_ROOT / "tests" / "integration" / "m2_leg.mjs"),
             "--task-id", self.parent_task_id, "--execution-id", self.execution_id,
             "--correlation-id", "CORR-90210", "--output-dir", str(m2_out_dir)],
            cwd=str(REPO_ROOT), capture_output=True, text=True, encoding="utf-8", timeout=180,
        )
        (m2_out_dir / "m2-leg-stdout.log").write_text(proc.stdout or "", encoding="utf-8")
        (m2_out_dir / "m2-leg-stderr.log").write_text(proc.stderr or "", encoding="utf-8")
        self.expect(proc.returncode == 0,
                    f"M2 leg 失败 (exit={proc.returncode})：{(proc.stderr or '')[-800:]}")
        summary = json.loads(proc.stdout.strip().splitlines()[-1])
        self.expect(summary["ok"] is True, f"M2 leg 摘要非 ok: {summary}")
        details["m2_summary"] = {k: v for k, v in summary.items() if k != "reply_content"}

        # 桥接：M2 本地登记簿产物 → 真实 M1 POST /artifacts（编排侧操作，如实标注非 M2 直连）
        content = summary["reply_content"]
        reply_sha = summary["reply_sha256"]
        artifact_path = f"phase1/logs/integration/m2-artifacts/{summary['dispatch_id']}/reply.json"
        (self.evidence_dir / "m2-artifacts").mkdir(parents=True, exist_ok=True)
        (self.evidence_dir / "m2-artifacts" / f"{summary['dispatch_id']}-reply.json").write_text(
            content, encoding="utf-8")
        resp = self.human.post("/api/v1/artifacts", {
            "task_id": self.parent_task_id, "type": "REVIEW_EVIDENCE",
            "path": artifact_path, "sha256": reply_sha, "content": content,
        })
        self.expect(resp.status_code == 201, f"M2 产物桥接登记: {resp.status_code} {resp.text[:400]}")
        bridge_id = resp.json()["artifact_id"]
        self.expect(resp.json()["sha256"] == reply_sha, "M1 登记的 sha256 与 M2 产物不符")
        details["bridge_artifact_id"] = bridge_id

        # 回读比对：GET /artifacts/{id} 内容逐字节一致
        fetched = self.human.get(f"/api/v1/artifacts/{bridge_id}")
        self.expect(fetched.status_code == 200, f"工件回读: {fetched.status_code}")
        self.expect(fetched.json().get("content") == content, "回读内容与 M2 产物不一致")
        details["bridge_roundtrip"] = "content identical"

    def step_child_unblock_and_board(self, details: dict) -> None:
        """验收②闭环 + 验收⑥：依赖解除后子任务就绪可领取；board 只计 ACCEPTED。"""
        # 父任务已 ACCEPTED → 子任务依赖门禁解除，PASS→READY 现在应成功
        resp = self.human.post(f"/api/v1/tasks/{self.child_task_id}/events", {
            "event": "PASS", "event_id": "EVT-CHILD-PASS-UNBLOCKED",
        })
        self.expect(resp.status_code == 200 and resp.json()["to_status"] == "READY",
                    f"依赖解除后子任务 PASS 应到 READY: {resp.status_code} {resp.text[:300]}")
        details["child_unblocked_to_ready"] = resp.json()

        res = self.mcp.call_tool("claim_task", {
            "task_id": self.child_task_id, "correlation_id": "CORR-90220",
            "base_commit": self.child_base_sha,
        })
        self.expect(not res["isError"], f"依赖解除后子任务 claim 失败: {json.dumps(res['payload'], ensure_ascii=False)[:400]}")
        details["child_claim"] = {"execution_id": res["payload"]["task"]["execution_id"],
                                  "status": res["payload"]["task"]["task"]["status"]}
        deps = self.human.get(f"/api/v1/tasks/{self.child_task_id}/dependencies").json()
        self.expect(deps["dependencies_satisfied"] is True, f"依赖应已满足: {deps}")
        details["child_dependencies_satisfied"] = deps

        # MCP 会话收尾：子任务提交 BLOCKED 报告释放会话（单会话单任务生命周期完整闭环）。
        # dev report 要求 IN_PROGRESS：先补 START（同父任务流程）。
        resp = self.zcode.post(f"/api/v1/tasks/{self.child_task_id}/events", {
            "event": "START", "event_id": "EVT-START-CHILD", "correlation_id": "CORR-90220",
        })
        self.expect(resp.status_code == 200 and resp.json()["to_status"] == "IN_PROGRESS",
                    f"子任务 START 事件: {resp.status_code} {resp.text[:300]}")
        res = self.mcp.call_tool("submit_result", {"report": {
            "task_id": self.child_task_id,
            "execution_id": res["payload"]["task"]["execution_id"],
            "status": "BLOCKED",
            "blocked_reason": "集成验收子任务到此为止（验收②依赖闭环即止）",
            "blocked_owner": "OWNER",
            "unblock_condition": "集成验收完成后人工处理",
            "implementation_summary": "子任务依赖闭环验证完成",
            "git": {"repository": PROJECT_ID, "branch": "feature/T-P1-102-child-task",
                    "base_commit": self.child_base_sha, "commit_sha": self.child_base_sha,
                    "changed_files": []},
            "tests": {"executed": False, "commands": [], "passed": 0, "failed": 0},
            "known_issues": ["验收②闭环即止，非真实缺陷"],
            "knowledge_updates_required": False,
            "self_assessment": "BLOCKED：验收闭环用例",
            "correlation_id": "CORR-90220",
            "batch_id": self.batch_id,
        }})
        self.expect(not res["isError"], f"子任务 BLOCKED 报告失败: {json.dumps(res['payload'], ensure_ascii=False)[:400]}")
        details["child_blocked_report"] = True

        # 验收⑥：board 只计 ACCEPTED（父 ACCEPTED weight=2；子 BLOCKED 不计 accepted）
        board = self.human.get(f"/api/v1/board?project_id={PROJECT_ID}").json()
        self.expect(board["total"] >= 1, f"board 无项目行: {board}")
        project_row = next(item for item in board["items"] if item["project_id"] == PROJECT_ID)
        batch_row = next(b for b in project_row["batches"] if b["batch_id"] == self.batch_id)
        self.expect(batch_row["accepted_tasks"] == 1,
                    f"accepted_tasks 应为 1（仅父任务）: {batch_row}")
        expected_percent = 2.0 / 3.0 * 100  # valid_weight = 2 + 1（子非 CANCELLED）
        self.expect(abs(project_row["completion_percent"] - expected_percent) < 0.01,
                    f"completion_percent 应约 {expected_percent:.2f}，实际 {project_row['completion_percent']}")
        details["board"] = {"accepted_tasks": batch_row["accepted_tasks"],
                            "completion_percent": project_row["completion_percent"],
                            "status_counts": project_row.get("status_counts")}

    def snapshot_state(self) -> dict:
        state = {}
        for task_id in (self.parent_task_id, self.child_task_id):
            state[f"task_{task_id}"] = self.human.get(f"/api/v1/tasks/{task_id}").json()
        state["commits_parent"] = self.human.get(f"/api/v1/commits?task_id={self.parent_task_id}").json()
        state["reports_dev"] = self.human.get("/api/v1/reports?type=development").json()
        state["reports_test"] = self.human.get("/api/v1/reports?type=test").json()
        state["messages_total"] = self.human.get("/api/v1/messages?page_size=1").json()["total"]
        state["board_percent"] = self.human.get(f"/api/v1/board?project_id={PROJECT_ID}").json()["items"][0]["completion_percent"]
        return {k: v for k, v in state.items()}

    def step_messages_dedup_and_sweep(self, details: dict) -> None:
        """验收④：message_id 幂等 / ACK / sweep / dead-letter 只读 / 白名单 403。"""
        h = self.human
        envelope = {
            "schema_version": "1.0",
            "message_id": "MSG-20261113-902001",
            "message_type": "PROGRESS_UPDATED",
            "created_at": utc_now_iso(),
            "source": {"agent_id": "ZCODE-01", "agent_type": "developer"},
            "target": {"agent_id": "AIEO-ORCHESTRATOR", "agent_type": "system"},
            "project_id": PROJECT_ID, "batch_id": self.batch_id,
            "task_id": self.parent_task_id, "correlation_id": "CORR-90230",
            "payload": {"note": "dedup probe"},
        }
        resp1 = h.post("/api/v1/messages", envelope)
        self.expect(resp1.status_code == 202, f"消息投递: {resp1.status_code} {resp1.text[:300]}")
        resp2 = h.post("/api/v1/messages", dict(envelope, payload={"note": "DIFFERENT-CONTENT"}))
        self.expect(resp2.status_code == 409 and resp2.json().get("code") == "RES-0003",
                    f"同 id 不同内容应 RES-0003: {resp2.status_code} {resp2.text[:300]}")
        total = h.get("/api/v1/messages?correlation_id=CORR-90230").json()["total"]
        self.expect(total == 1, f"重复消息不得落第二条（total={total}）")
        details["duplicate_message"] = {"first": resp1.json()["status"], "second_code": resp2.json()["code"],
                                        "rows": total}

        # dead-letter 查询严格只读（F-501 语义复核）：查询前后 PENDING 消息状态不变
        before = self.zcode.get("/api/v1/messages?status=PENDING&page_size=200").json()
        dl = self.zcode.get("/api/v1/messages/dead-letter").json()
        after = self.zcode.get("/api/v1/messages?status=PENDING&page_size=200").json()
        self.expect(before == after, "dead-letter 查询不得改变 PENDING 消息状态")
        details["dead_letter_readonly"] = {"dead_letter_total": dl.get("total"),
                                           "pending_before": before["total"],
                                           "pending_after": after["total"]}

        # ACK 幂等（INBOUND 消息 PROCESSED；重复 ACK 返回当前状态不报错）
        target_msg = self.dev_completed_message_id
        ack1 = self.zcode.post(f"/api/v1/messages/{target_msg}/ack", {"agent_id": "AIEO-ORCHESTRATOR"})
        self.expect(ack1.status_code == 200, f"ACK: {ack1.status_code} {ack1.text[:300]}")
        ack2 = self.zcode.post(f"/api/v1/messages/{target_msg}/ack", {"agent_id": "AIEO-ORCHESTRATOR"})
        self.expect(ack2.status_code == 200 and ack2.json().get("processing_status") == "PROCESSED",
                    f"重复 ACK 应幂等: {ack2.status_code} {ack2.text[:300]}")
        details["ack_idempotent"] = ack2.json().get("processing_status")

        # 白名单 403（C7 §8.6 默认拒绝）：sweep / requeue / projects 对服务身份拒绝
        for label, method, path, body in [
            ("sweep", "post", "/api/v1/messages/sweep", None),
            ("requeue", "post", f"/api/v1/messages/{envelope['message_id']}/requeue",
             {"actor": "ZCODE-01"}),
            ("projects_create", "post", "/api/v1/projects", {"project_id": "ROGUE-PROJ", "name": "x"}),
        ]:
            resp = getattr(self.zcode, method)(path, body)
            self.expect(resp.status_code == 403 and resp.json().get("code") == "AUTH-0002",
                        f"服务身份 {label} 应 403 AUTH-0002: {resp.status_code} {resp.text[:200]}")
        details["service_forbidden_negatives"] = ["sweep", "requeue", "projects_create"]

        # sweep（人类专属）：OUTBOUND PENDING → SENT
        pending_before = h.get("/api/v1/messages?status=PENDING&direction=OUTBOUND&page_size=200").json()["total"]
        sweep = h.post("/api/v1/messages/sweep")
        self.expect(sweep.status_code == 200, f"sweep: {sweep.status_code} {sweep.text[:300]}")
        counts = sweep.json()["counts"]
        pending_after = h.get("/api/v1/messages?status=PENDING&direction=OUTBOUND&page_size=200").json()["total"]
        self.expect(pending_before > 0 and pending_after == 0 and counts["delivered"] == pending_before,
                    f"sweep 应投递全部 OUTBOUND PENDING: before={pending_before} counts={counts} after={pending_after}")
        details["sweep"] = {"delivered": counts["delivered"], "outbox_pending_before": pending_before,
                            "outbox_pending_after": pending_after}

    def step_restart_persistence(self, details: dict) -> None:
        """验收⑤：真实进程重启（terminate → 同 DB 重启 → 状态不丢失）。"""
        before = self.snapshot_state()
        self.server.stop()
        self.log("M1 进程已 terminate，开始重启（同 DB 路径）")
        server2 = M1Server(self.work_dir, "run2")
        server2.port = self.server.port  # 同端口重启（端口已释放）
        server2.base_url = self.server.base_url
        server2.env["AIEO_SERVER_BIND"] = f"127.0.0.1:{server2.port}"
        server2.start()
        self.server = server2
        self.human = HumanSession(server2.base_url)
        self.human.login()
        # 服务令牌与人类会话均重建；服务令牌存 DB（service_credentials），应继续有效
        after = self.snapshot_state()
        for key in before:
            self.expect(json.dumps(before[key], sort_keys=True) == json.dumps(after[key], sort_keys=True),
                        f"重启后状态不一致: {key}")
        details["compared_keys"] = list(before.keys())
        details["restart"] = "terminate + restart same DB path, all keys identical"

        # 服务令牌跨重启仍有效（C7 持久凭证）
        resp = self.zcode.get("/api/v1/auth/session")
        self.expect(resp.status_code == 200 and resp.json().get("kind") == "service",
                    f"重启后服务令牌失效: {resp.status_code} {resp.text[:200]}")
        details["service_token_survives_restart"] = True

    def step_audit_trail(self, details: dict) -> None:
        """验收⑦：/audit 断言关键动作与 actor。"""
        resp = self.human.get("/api/v1/audit?page_size=200")
        self.expect(resp.status_code == 200, f"audit: {resp.status_code}")
        rows = resp.json()["items"]
        actions = {row["action"] for row in rows}
        required_actions = {
            "project_created", "batch_created", "task_created", "task_transition",
            "claim_task", "artifact_registered", "git_commit_registered",
            "report_registered", "message_registered", "message_ack",
            "service_credential_issued", "login_success",
        }
        missing = required_actions - actions
        self.expect(not missing, f"审计缺少动作: {sorted(missing)}；实见 {sorted(actions)}")
        actors = {row["actor_id"] for row in rows}
        for expected_actor in (ADMIN_USERNAME, "ZCODE-01", "REVIEWER-01", "GIT-WORKER-01"):
            self.expect(expected_actor in actors, f"审计缺少 actor {expected_actor}: {sorted(actors)}")
        details["audit_rows_total"] = resp.json()["total"]
        details["audit_actions"] = sorted(actions)
        details["audit_actors"] = sorted(actors)

    # ---------- 执行 ----------

    def run(self) -> int:
        started = time.monotonic()
        exit_code = 0
        try:
            self.step_boot_and_setup = self.step("01_boot_and_setup")(self.step_boot_and_setup)
            self.step_dependency_gate = self.step("02_dependency_gate_negative")(self.step_dependency_gate)
            self.step_m3_claim_and_progress = self.step("03_m3_claim_and_progress")(self.step_m3_claim_and_progress)
            self.step_m4_commit_and_collect = self.step("04_m4_commit_and_collect")(self.step_m4_commit_and_collect)
            self.step_m3_submit_result = self.step("05_m3_submit_result")(self.step_m3_submit_result)
            self.step_git_validate_and_accept = self.step("06_git_validate_and_accept")(self.step_git_validate_and_accept)
            self.step_m2_leg_and_bridge = self.step("07_m2_leg_and_bridge")(self.step_m2_leg_and_bridge)
            self.step_child_unblock_and_board = self.step("08_child_unblock_and_board")(self.step_child_unblock_and_board)
            self.step_messages_dedup_and_sweep = self.step("09_messages_dedup_and_sweep")(self.step_messages_dedup_and_sweep)
            self.step_restart_persistence = self.step("10_restart_persistence")(self.step_restart_persistence)
            self.step_audit_trail = self.step("11_audit_trail")(self.step_audit_trail)

            self.step_boot_and_setup()
            self.step_dependency_gate()
            self.step_m3_claim_and_progress()
            self.step_m4_commit_and_collect()
            self.step_m3_submit_result()
            self.step_git_validate_and_accept()
            self.step_m2_leg_and_bridge()
            self.step_child_unblock_and_board()
            self.step_messages_dedup_and_sweep()
            self.step_restart_persistence()
            self.step_audit_trail()
        except SystemExit as exc:
            exit_code = exc.code if isinstance(exc.code, int) else 1
        finally:
            if getattr(self, "mcp", None):
                self.mcp.close()
            if getattr(self, "m4_rest_client", None):
                self.m4_rest_client.close()
            for session in ("human", "zcode", "reviewer", "git_worker_session"):
                obj = getattr(self, session, None)
                if obj:
                    obj.close()
            if getattr(self, "server", None):
                self.server.stop()
            if exit_code == 0:
                self.flush_evidence(finished=True, exit_code=0)
                self._archive_work_dir()
            # scratch 仓库留证清单（仓库本体不入 evidence，记录 SHA 与分支）
            (self.evidence_dir / "scratch-repos.json").write_text(json.dumps({
                "parent_base_sha": getattr(self, "parent_base_sha", None),
                "parent_branch": BRANCH_PARENT,
                "child_base_sha": getattr(self, "child_base_sha", None),
                "work_dir_retained": str(self.work_dir),
            }, ensure_ascii=False, indent=2), encoding="utf-8")
            self.log(f"===== E2E 结束 exit={exit_code} 总耗时 {round(time.monotonic() - started, 1)}s work_dir={self.work_dir} =====")
        return exit_code

    def _archive_work_dir(self) -> None:
        """M1/M4 运行时产物从 temp work_dir 归档进证据目录（work_dir 由 OS 管理生命周期）。"""
        import shutil as _shutil

        archived: dict[str, list[str]] = {}
        m1_dir = self.evidence_dir / "m1-server"
        m1_dir.mkdir(exist_ok=True)
        archived["m1-server"] = [p.name for p in self.work_dir.glob("m1-server-*.log")
                                 if _shutil.copy2(p, m1_dir / p.name) or True]
        for sub in ("m4-logs", "m4-diffs"):
            src = self.work_dir / sub
            if src.is_dir():
                _shutil.copytree(src, self.evidence_dir / sub, dirs_exist_ok=True)
                archived[sub] = [p.name for p in sorted(src.rglob("*")) if p.is_file()]
        (self.evidence_dir / "work-dir-archive.json").write_text(
            json.dumps({"archived_from": str(self.work_dir), "entries": archived},
                       ensure_ascii=False, indent=2), encoding="utf-8")
        self.log(f"work_dir 产物已归档: {archived}")


def main() -> int:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    evidence_dir = REPO_ROOT / "phase1" / "logs" / f"integration-{stamp}"
    e2e = E2E(evidence_dir)
    print(f"[e2e] evidence dir: {evidence_dir}")
    code = e2e.run()
    print(f"[e2e] exit={code} all_ok={all(s['ok'] for s in e2e.steps)} steps={len(e2e.steps)}")
    return code


if __name__ == "__main__":
    sys.exit(main())
