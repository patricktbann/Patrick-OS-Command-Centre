-- DEV / disposable CI only. Production migration needs Patrick's explicit approval.
-- Single-use OAuth state, randomly generated with minimum 256 bits of entropy.
CREATE TABLE IF NOT EXISTS agent_oauth_login_state (
 state_hash char(64) PRIMARY KEY CHECK(state_hash ~ '^[0-9a-f]{64}$'),
 issued_at timestamptz NOT NULL,
 expires_at timestamptz NOT NULL,
 consumed_at timestamptz,
 CHECK(expires_at > issued_at)
);
CREATE INDEX IF NOT EXISTS idx_agent_oauth_state_expiry ON agent_oauth_login_state(expires_at);
-- Ensure auth DB permissions distinguish anonymous login-state insertion,
-- callback consumption, session issuance and session-only verification.
