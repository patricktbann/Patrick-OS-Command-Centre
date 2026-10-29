-- TSY Agent Runtime V3.5 / proposed schema, NOT applied to production.
CREATE TABLE IF NOT EXISTS agent_task_dispatch (
 task_id varchar(120) PRIMARY KEY,
 state varchar(32) NOT NULL CHECK (state IN ('RESERVED','EXECUTING','RECONCILIATION_REQUIRED')),
 executor_run_id varchar(120) UNIQUE,
 executor_type varchar(120),
 approval_id varchar(120),
 reserved_at timestamptz NOT NULL DEFAULT now(),
 started_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK ((state='RESERVED' AND executor_run_id IS NULL)
     OR (state IN ('EXECUTING','RECONCILIATION_REQUIRED')))
);
CREATE TABLE IF NOT EXISTS agent_dispatch_audit (
 event_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 task_id varchar(120) NOT NULL REFERENCES agent_task_dispatch(task_id),
 event_type varchar(48) NOT NULL,
 details jsonb NOT NULL DEFAULT '{}'::jsonb,
 occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_agent_dispatch_audit_task ON agent_dispatch_audit(task_id,event_id);
-- Production must apply explicit least-privilege DB roles / RLS where appropriate.
