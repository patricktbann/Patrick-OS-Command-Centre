-- Draft only. Do not apply without explicit approval and migration review.
-- Email approval records are separate from engineering task approvals.
CREATE TABLE IF NOT EXISTS ai_email_approval_request (
 request_id varchar(64) PRIMARY KEY,
 task_id varchar(120) NOT NULL,
 principal_email varchar(254) NOT NULL,
 scope_text text NOT NULL CHECK (length(scope_text) BETWEEN 1 AND 4000),
 risk varchar(12) NOT NULL CHECK (risk IN ('LOW','MEDIUM','HIGH')),
 status varchar(24) NOT NULL DEFAULT 'PENDING'
  CHECK (status IN ('PENDING','APPROVED','REJECTED','REVISION_REQUESTED','RELEASED','EXPIRED')),
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 decided_at timestamptz,
 released_at timestamptz,
 CHECK ((status='RELEASED' AND released_at IS NOT NULL AND risk='LOW')
     OR (status<>'RELEASED' AND released_at IS NULL))
);
CREATE TABLE IF NOT EXISTS ai_email_approval_event (
 event_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 request_id varchar(64) NOT NULL REFERENCES ai_email_approval_request(request_id),
 provider_message_id varchar(255),
 action varchar(24) NOT NULL
  CHECK (action IN ('REQUESTED','APPROVED','REJECTED','REVISION_REQUESTED','RELEASED','EXPIRED')),
 recorded_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(provider_message_id)
);
CREATE INDEX IF NOT EXISTS idx_ai_email_approval_pending
 ON ai_email_approval_request(status,expires_at);
-- Release must be one atomic transaction:
-- UPDATE ... SET status='RELEASED',released_at=now()
-- WHERE request_id=$1 AND status='APPROVED' AND risk='LOW' AND expires_at>now()
-- RETURNING task_id,scope_text;
-- Require exactly one returned row; commit corresponding audit event atomically.
