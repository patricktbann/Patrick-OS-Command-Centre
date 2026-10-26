-- V3.5 PostgreSQL design — apply only after migration review and Patrick approval.
-- Database is NOT provisioned or changed by this source file.
CREATE TABLE IF NOT EXISTS tsy_agent_tasks (
 task_id text PRIMARY KEY,
 agent_id text NOT NULL,
 company_id text NOT NULL,
 division_id text NOT NULL,
 repository text NOT NULL,
 issue_number bigint NOT NULL CHECK(issue_number > 0),
 revision text NOT NULL,
 assignment jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT unique_task_issue UNIQUE (repository,issue_number)
);
CREATE TABLE IF NOT EXISTS tsy_agent_approvals (
 approval_id text PRIMARY KEY,
 task_id text NOT NULL REFERENCES tsy_agent_tasks(task_id),
 principal_id text NOT NULL,
 decision text NOT NULL CHECK(decision IN ('approve','reject')),
 assignment_revision text NOT NULL,
 approval jsonb NOT NULL,
 approved_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS tsy_agent_dispatches (
 task_id text PRIMARY KEY REFERENCES tsy_agent_tasks(task_id),
 state text NOT NULL CHECK(state IN ('reserved','started','reconciliation_required')),
 run_id text,
 executor_type text,
 approval_id text NOT NULL REFERENCES tsy_agent_approvals(approval_id),
 reserved_at timestamptz NOT NULL DEFAULT now(),
 started_at timestamptz,
 CHECK((state <> 'started') OR (run_id IS NOT NULL AND executor_type IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS tsy_agent_events (
 event_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 task_id text NOT NULL REFERENCES tsy_agent_tasks(task_id),
 event_kind text NOT NULL,
 event_payload jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tsy_agent_events_task_idx ON tsy_agent_events(task_id,event_id);
-- Append-only audit: application role should have INSERT and SELECT, never UPDATE or DELETE.
