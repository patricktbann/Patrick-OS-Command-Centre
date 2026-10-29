-- DEV/CI ONLY. Requires separately approved production migration.
-- Bind a claimed task to its current approval and authoritative assignment digest.
ALTER TABLE agent_task_dispatch ADD COLUMN IF NOT EXISTS repository varchar(255);
ALTER TABLE agent_task_dispatch ADD COLUMN IF NOT EXISTS task_digest char(64);
ALTER TABLE agent_task_dispatch ADD COLUMN IF NOT EXISTS principal_id varchar(120);
ALTER TABLE agent_task_dispatch ADD COLUMN IF NOT EXISTS operator_id varchar(120);
ALTER TABLE agent_task_dispatch ADD COLUMN IF NOT EXISTS allowed_actions jsonb;
ALTER TABLE agent_task_dispatch ADD CONSTRAINT agent_dispatch_task_digest_format
 CHECK(task_digest IS NULL OR task_digest ~ '^[0-9a-f]{64}$');
CREATE INDEX IF NOT EXISTS idx_agent_task_approval_binding ON agent_task_approval(approval_id,task_id,repository,principal_id,task_digest,status);
-- Approval rows must be locked during the claim, so REVOKE serializes
-- against the reservation. An already accepted task is not automatically
-- cancelled by a subsequent revocation; cancellation is a separate control.
