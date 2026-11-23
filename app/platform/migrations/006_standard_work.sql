CREATE TABLE standard_plans (
    plan_id TEXT NOT NULL,
    version TEXT NOT NULL,
    digest TEXT NOT NULL,
    batch_id TEXT NOT NULL UNIQUE REFERENCES batches(batch_id),
    approved_by TEXT NOT NULL,
    PRIMARY KEY (plan_id, version)
);

CREATE TABLE standard_tasks (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT NOT NULL UNIQUE REFERENCES tasks(task_id),
    base_commit TEXT NOT NULL,
    urgent_order INTEGER,
    phase TEXT NOT NULL DEFAULT 'WAITING'
        CHECK (phase IN ('WAITING','RESERVED','ACTIVE','DRAINING','PAUSED','CLOSED')),
    execution_id TEXT REFERENCES task_executions(execution_id),
    next_task_id TEXT REFERENCES tasks(task_id),
    checkpoint TEXT
);

CREATE TABLE standard_reviews (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT NOT NULL REFERENCES standard_tasks(task_id),
    execution_id TEXT NOT NULL REFERENCES task_executions(execution_id),
    round_id TEXT NOT NULL,
    purpose TEXT NOT NULL CHECK (purpose IN ('planning','review','acceptance')),
    message TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'QUEUED'
        CHECK (state IN ('QUEUED','DISPATCHING','UNCERTAIN','DONE')),
    evidence TEXT,
    UNIQUE (task_id, round_id)
);

CREATE UNIQUE INDEX standard_one_review_in_flight ON standard_reviews ((1))
    WHERE state IN ('DISPATCHING','UNCERTAIN');

CREATE TABLE standard_journal (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    operation TEXT NOT NULL,
    object_id TEXT NOT NULL,
    detail TEXT NOT NULL,
    committed_at TEXT NOT NULL
);
