"""Pydantic request models. Unknown fields are ignored (contract C1 §2.2 rule 4)."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

PROJECT_ID_PATTERN = r"^[A-Z0-9-]{1,32}$"
BATCH_ID_PATTERN = r"^BATCH-\d{3,}$"
TASK_ID_PATTERN = r"^T-(P\d+-)?\d{3,}$"
MESSAGE_ID_PATTERN = r"^MSG-\d{8}-\d{6}$"
SHA256_PATTERN = r"^[0-9a-f]{64}$"
GIT_SHA_PATTERN = r"^[0-9a-f]{40}$"
EXEC_ID_PATTERN = r"^EXEC-\d{3,}$"
CORRELATION_PATTERN = (
    r"^(CORR-\d{3,}|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}"
    r"-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})$"
)
SCHEMA_VERSION_PATTERN = r"^\d+\.\d+$"

AGENT_TYPES = ("system", "developer", "reviewer", "tester", "auditor", "user")

MESSAGE_TYPES = (
    "TASK_PLAN_REQUEST", "TASK_PLAN_SUBMITTED",
    "ARCH_REVIEW_REQUEST", "ARCH_REVIEW_SUBMITTED",
    "TASK_ASSIGNED", "TASK_ACCEPTED", "PROGRESS_UPDATED", "BLOCKER_REPORTED",
    "DEVELOPMENT_COMPLETED", "CODE_REVIEW_REQUEST", "CODE_REVIEW_SUBMITTED",
    "TEST_ACCEPTANCE_REQUEST", "TEST_ACCEPTANCE_SUBMITTED",
    "AUDIT_REQUEST", "AUDIT_SUBMITTED", "APPROVAL_REQUIRED",
)

# message_type -> scoping level for conditional mandatory fields (C1 §2.2)
MESSAGE_TYPE_LEVEL: dict[str, str] = {
    "TASK_ASSIGNED": "task",
    "TASK_ACCEPTED": "task",
    "PROGRESS_UPDATED": "task",
    "BLOCKER_REPORTED": "task",
    "DEVELOPMENT_COMPLETED": "task",
    "CODE_REVIEW_REQUEST": "task",
    "CODE_REVIEW_SUBMITTED": "task",
    "TEST_ACCEPTANCE_REQUEST": "task",
    "TEST_ACCEPTANCE_SUBMITTED": "task",
    "TASK_PLAN_REQUEST": "batch",
    "TASK_PLAN_SUBMITTED": "batch",
    "ARCH_REVIEW_REQUEST": "batch",
    "ARCH_REVIEW_SUBMITTED": "batch",
    "AUDIT_REQUEST": "batch",
    "AUDIT_SUBMITTED": "batch",
    "APPROVAL_REQUIRED": "project",
}

MESSAGE_PAYLOAD_MAX_BYTES = 256 * 1024  # C1 §2.2: M1 payload cap


class _Ignore(BaseModel):
    model_config = ConfigDict(extra="ignore")


class AgentRef(_Ignore):
    agent_id: str = Field(pattern=PROJECT_ID_PATTERN)
    agent_type: Literal["system", "developer", "reviewer", "tester", "auditor", "user"]


class MessageIn(_Ignore):
    schema_version: str = Field(pattern=SCHEMA_VERSION_PATTERN, max_length=16)
    message_id: str = Field(pattern=MESSAGE_ID_PATTERN, max_length=64)
    message_type: Literal[MESSAGE_TYPES]  # type: ignore[valid-type]
    created_at: str
    source: AgentRef
    target: AgentRef
    project_id: str = Field(pattern=PROJECT_ID_PATTERN)
    batch_id: str | None = Field(default=None, pattern=BATCH_ID_PATTERN)
    task_id: str | None = Field(default=None, pattern=TASK_ID_PATTERN)
    correlation_id: str = Field(pattern=CORRELATION_PATTERN, max_length=64)
    payload: dict = Field(default_factory=dict)

    @field_validator("created_at")
    @classmethod
    def _created_at_present(cls, value: str) -> str:
        if not value or not isinstance(value, str):
            raise ValueError("created_at must be an ISO 8601 string with timezone")
        return value


class ProjectCreate(_Ignore):
    project_id: str = Field(pattern=PROJECT_ID_PATTERN)
    name: str = Field(min_length=1, max_length=200)
    description: str | None = None
    knowledge_version: str | None = None


class RepositoryCreate(_Ignore):
    project_id: str = Field(pattern=PROJECT_ID_PATTERN)
    url: str = Field(min_length=1, max_length=500)
    local_path: str = Field(min_length=1, max_length=500)
    default_branch: str = Field(default="main", min_length=1, max_length=200)


class BatchCreate(_Ignore):
    project_id: str = Field(pattern=PROJECT_ID_PATTERN)
    requirement: str = Field(min_length=1)
    engineering_standard_version: str = Field(min_length=1, max_length=100)
    knowledge_base_commit: str = Field(pattern=GIT_SHA_PATTERN)


class AgentCreate(_Ignore):
    agent_id: str = Field(pattern=PROJECT_ID_PATTERN)
    agent_type: Literal["system", "developer", "reviewer", "tester", "auditor", "user"]
    role: str = Field(min_length=1, max_length=100)
    capabilities: dict | None = None
    issue_service_token: bool = False


class TaskCreate(_Ignore):
    batch_id: str = Field(pattern=BATCH_ID_PATTERN)
    parent_id: str | None = Field(default=None, pattern=TASK_ID_PATTERN)
    title: str = Field(min_length=1, max_length=300)
    description: str | None = None
    priority: Literal["P0", "P1", "P2", "P3"] = "P2"
    weight: float = Field(default=1.0, gt=0)
    files_scope: list[str] = Field(default_factory=list)
    acceptance_criteria: list[str] = Field(default_factory=list)
    engineering_standard_items: list[str] = Field(default_factory=list)
    engineering_standard_version: str = Field(min_length=1, max_length=100)
    knowledge_base_commit: str = Field(pattern=GIT_SHA_PATTERN)
    dependencies: list[str] = Field(default_factory=list)


class TaskEventIn(_Ignore):
    event: str = Field(min_length=1, max_length=64)
    event_id: str = Field(min_length=1, max_length=64)
    correlation_id: str | None = Field(default=None, max_length=64)
    blocked_reason: str | None = None
    blocked_owner: str | None = None
    unblock_condition: str | None = None
    cancelled_by: str | None = None
    cancelled_reason: str | None = None


class ClaimRequest(_Ignore):
    agent_id: str = Field(pattern=PROJECT_ID_PATTERN)
    base_commit: str = Field(pattern=GIT_SHA_PATTERN)
    correlation_id: str | None = Field(default=None, pattern=CORRELATION_PATTERN, max_length=64)


class AckRequest(_Ignore):
    agent_id: str | None = Field(default=None, pattern=PROJECT_ID_PATTERN)


class RequeueRequest(_Ignore):
    actor: str = Field(min_length=1, max_length=64)
    reason: str | None = None


class DevReportIn(_Ignore):
    task_id: str = Field(pattern=TASK_ID_PATTERN)
    execution_id: str = Field(pattern=EXEC_ID_PATTERN)
    status: Literal["COMPLETED", "BLOCKED"]
    blocked_reason: str | None = None
    blocked_owner: str | None = None
    unblock_condition: str | None = None
    payload: dict = Field(default_factory=dict)


class ReviewReportIn(_Ignore):
    task_id: str = Field(pattern=TASK_ID_PATTERN)
    execution_id: str = Field(pattern=EXEC_ID_PATTERN)
    reviewed_commit: str = Field(pattern=GIT_SHA_PATTERN)
    reviewer: str = Field(pattern=PROJECT_ID_PATTERN)
    result: Literal["PASS", "REWORK", "BLOCKED"]
    task_package_hash: str = Field(pattern=SHA256_PATTERN)
    base_commit: str = Field(pattern=GIT_SHA_PATTERN)
    engineering_standard_version: str = Field(min_length=1, max_length=100)
    knowledge_base_commit: str = Field(pattern=GIT_SHA_PATTERN)
    blocked_reason: str | None = None
    blocked_owner: str | None = None
    unblock_condition: str | None = None
    payload: dict = Field(default_factory=dict)


class TestReportIn(_Ignore):
    task_id: str = Field(pattern=TASK_ID_PATTERN)
    execution_id: str = Field(pattern=EXEC_ID_PATTERN)
    commit_sha: str = Field(pattern=GIT_SHA_PATTERN)
    execution_result: Literal["EXECUTED_PASS", "EXECUTED_FAIL", "NOT_EXECUTED", "CLAIMED_ONLY", "BLOCKED"]
    result: Literal["PASS", "REWORK", "BLOCKED"]
    artifact_id: str | None = Field(default=None, pattern=r"^ART-[A-Z0-9-]+$")
    payload: dict = Field(default_factory=dict)


ARTIFACT_TYPES = ("TEST_LOG", "DEV_REPORT", "REVIEW_EVIDENCE", "DIFF", "ATTACHMENT", "OTHER")


class ArtifactCreate(_Ignore):
    task_id: str | None = Field(default=None, pattern=TASK_ID_PATTERN)
    type: Literal["TEST_LOG", "DEV_REPORT", "REVIEW_EVIDENCE", "DIFF", "ATTACHMENT", "OTHER"]
    path: str = Field(min_length=1, max_length=512)
    sha256: str = Field(pattern=SHA256_PATTERN)
    content: str | None = None


class CommitCreate(_Ignore):
    task_id: str = Field(pattern=TASK_ID_PATTERN)
    execution_id: str = Field(pattern=EXEC_ID_PATTERN)
    repository_id: str = Field(pattern=r"^REPO-\d{3,}$")
    branch: str = Field(min_length=1, max_length=200)
    sha: str = Field(pattern=GIT_SHA_PATTERN)
    base_commit: str = Field(pattern=GIT_SHA_PATTERN)
    diff_artifact_id: str | None = Field(default=None, pattern=r"^ART-[A-Z0-9-]+$")


APPROVAL_TARGET_TYPES = (
    "BATCH_PLAN", "ARCH_REVIEW", "MERGE_TO_MAIN", "RELEASE",
    "DEAD_LETTER_REQUEUE", "CONTRACT_CHANGE", "OTHER",
)


class ApprovalCreate(_Ignore):
    target_type: Literal["BATCH_PLAN", "ARCH_REVIEW", "MERGE_TO_MAIN", "RELEASE", "DEAD_LETTER_REQUEUE", "CONTRACT_CHANGE", "OTHER"]
    target_id: str = Field(min_length=1, max_length=120)
    actor: str = Field(min_length=1, max_length=64)
    reason: str | None = None
    decision: Literal["PENDING", "APPROVED", "REJECTED"] = "PENDING"


class LoginIn(_Ignore):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=200)
