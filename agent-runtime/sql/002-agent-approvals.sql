-- Draft only: PostgreSQL durable task-specific approval record.
-- Must be applied by a separately authorized operator after UAT.
CREATE TABLE IF NOT EXISTS agent_task_approval (
 approval_id varchar(120) PRIMARY KEY,
 task_id varchar(120) NOT NULL,
 repository varchar(255) NOT NULL,
 principal_id varchar(120) NOT NULL,
 task_digest char(64) NOT NULL CHECK (task_digest ~ '^[0-9a-f]{64}$'),
 status varchar(16) NOT NULL CHECK(status IN ('APPROVED','REVOKED')),
 approved_at timestamptz NOT NULL,
 revoked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK ((status='APPROVED' AND revoked_at IS NULL)
  OR (status='REVOKED' AND revoked_at IS NOT NULL)),
 UNIQUE(task_id,principal_id,task_digest)
);
CREATE TABLE IF NOT EXISTS agent_approval_audit (
 event_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 approval_id varchar(120) NOT NULL REFERENCES agent_task_approval(approval_id),
 event_type varchar(24) NOT NULL CHECK(event_type IN ('APPROVED','REVOKED')),
 recorded_at timestamptz NOT NULL DEFAULT now(),
 details jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_agent_approval_lookup
 ON agent_task_approval(task_id,principal_id,status);
