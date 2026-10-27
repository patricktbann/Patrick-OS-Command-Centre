-- DEV/CI ONLY: authenticated private server session records.
-- A trusted identity provider must issue sessions separately; no public create/login route.
-- Store SHA-256 of a cryptographically random >=256-bit session secret, never the raw token.
CREATE TABLE IF NOT EXISTS agent_private_session (
 session_hash char(64) PRIMARY KEY CHECK (session_hash ~ '^[0-9a-f]{64}$'),
 principal_id varchar(120) NOT NULL,
 issued_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 revoked_at timestamptz,
 CHECK (expires_at > issued_at),
 CHECK (revoked_at IS NULL OR revoked_at >= issued_at)
);
CREATE INDEX IF NOT EXISTS idx_agent_private_session_expiry ON agent_private_session(expires_at);
-- Enforce trusted issuer and reader through separate, least-privilege DB roles before release.
-- No schema migration may be run on Patrick's NAS or production database without approval.
