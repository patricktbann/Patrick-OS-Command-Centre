# V3.5 server authorization and durable store — integration instructions

This branch builds on the PR #5 dispatch fix and remains a **non-deployed backend proposal**.

## New server-only components
- `server-authorization.mjs`: independently authenticates server session; compares request with canonical persisted assignment; checks task-bound principal approval revision; fetches and checks the intended GitHub issue. It ignores client-provided actor/approval flags.
- `postgres-store.mjs`: parameterized SQL for atomic task reservations, run acknowledgment and reconciliation read-back.
- `sql/001-agent-task-ledger.sql`: proposed PostgreSQL schema for tasks, approvals, dispatches, and append-only events.
- `server-authorization.test.mjs` and `postgres-store.test.mjs`: isolated adapter and rejection tests; **mock** identity, GitHub and SQL adapters.

## Production blockers
1. No actual session identity provider is connected.
2. No trusted persistent task/approval query adapters are configured.
3. PostgreSQL is not provisioned or migrated; audit/event append and reconciler not integrated.
4. No authenticated Codex Cloud task-start endpoint is available in this conversation.
5. No user-facing dispatch is activated; no release or merge is requested.

Trust contract: inject the server verifier at a privileged composition root. The GitHub adapter must fetch an authenticated GitHub API response for the exact repository and issue; do not accept request-provided issue objects. All assignment and approval records must be written by authenticated services and revision-locked.

Never bundle this code into public Pages client JavaScript. Don't use client ratings or localStorage as authentication or as a task runner. Rollback is leave draft branch unmerged.

## Verification
`node --test agent-runtime/*.test.mjs` via GitHub Actions. The pass result proves contract behavior under mock adapters, NOT complete production authentication or Codex autonomy.
