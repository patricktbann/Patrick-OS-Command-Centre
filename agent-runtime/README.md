# V3.5 — Governed AI-Agent Execution Evidence

This folder implements the first non-UI, deterministic evidence logic for TSY Group AI Office.

## What it actually does
- Validates basic assignment fields, company/division and explicit approval setting.
- Accepts **trusted, previously verified** GitHub task metadata, executor run references, commits/PRs, QA test evidence and explicit Patrick approval.
- Computes a conservative state without inventing execution.
- Keeps ability rating sliders separate from model capability.
- Contains `evidence.test.mjs`, deterministic test cases runnable via `node --test agent-runtime/evidence.test.mjs`.

## What it cannot do yet
It is **not a runner**. There is no Codex API authentication, background service, job queue, server-side session store, append-only audit or authenticated approval endpoint. The evidence objects marked `verified` **MUST be issued and checked by a trusted backend**. The public browser may not be trusted to set `verified: true`; it must never gain deployment authority from these objects.

## Secure integration sequence
1. Identity / OAuth or GitHub App authentication with minimal scopes.
2. Server-side Agent and Task registry and immutable task↔agent↔repository binding.
3. Approved task intake, replay protection, permission validation and prompt injection boundaries.
4. Call only an authorized executor, capture authentic returned run ID.
5. Read GitHub branches/PRs/commits and CI test status through server-side verification.
6. Independent QA and explicit authenticated principal approval.
7. Return read-only evidence snapshots to GitHub Pages; statuses may be displayed but never self-certified.

## Contract
`deriveTaskStatus(task, evidence)` returns one of: BLOCKED, DRAFT, ASSIGNED, EXECUTING, OUTPUT_READY, QA_FAILED, UAT_PENDING, COMPLETE.

No external paid services are enabled. V3.4 frozen visual baseline is not modified. No production deployment/merge occurs through this module.

## Test and review
Run `node --test agent-runtime/evidence.test.mjs` in Node.js 20+.

A subset of **10 status cases** was executed through an isolated JavaScript evaluator in the Brain tooling. The checked-in Node test file is **not yet evidenced as run in GitHub CI**.

Engineering handoff: https://github.com/patricktbann/Patrick-OS-Command-Centre/issues/2

## Approved task dispatch gate (new)

`dispatch.mjs` provides an inert server-side adapter, not a live Codex Cloud connection. It fails closed unless **all three** are supplied: an explicit repository/approval policy, an atomic durable reservation store, and an authenticated executor implementation. A public page must never construct trusted approval fields or call `dispatchApprovedTask` with self-asserted approval.

- `validateDispatch` rejects wrong repositories, unauthenticated dispatchers, unauthorized actions, missing principal approval, mismatched GitHub task IDs, and replay-key mismatch.
- `dispatchApprovedTask` reserves task IDs before calling an injected executor and requires a returned run ID. Ambiguous errors require reconciliation rather than blind retry.
- `dispatch.test.mjs` uses **test stubs**, not real Codex.
- CI now runs `node --test agent-runtime/*.test.mjs` (both state and dispatch tests).

**Caution:** The sample `trustedBackendVerified` and `verified` fields are an adapter contract, not cryptographic proof. A production service must derive them from authenticated server operations, enforce immutable assignment records, and persist approvals and events to an append-only audit store. Do not expose this dispatcher directly to GitHub Pages or accept browser-provided evidence.

Pending: obtain an actual Codex Cloud execution transport and authorization; implement an authenticated server and durable store; complete a harmless real run with an authentic run ID and PR.

## Issue #4: independent dispatch authorization

`dispatchApprovedTask(input, {policy, store, executor, verifyDispatch})` now requires
an asynchronous server-owned verifier. Missing or denied verification fails before
reservation or execution. The verifier must authenticate the session independently,
load the immutable assignment and approved scope, confirm the authorized principal's
approval for that exact assignment/repository, and verify the GitHub issue through
trusted server operations. It returns canonical `{task, actor, approval,
verifiedIssue, idempotencyKey}` records, or null/throws on denial. Never implement it
as `async request => request`, or derive its result from request flags. Configure
this function only in server code; it is not a request field. The request task and
idempotency key must exactly match the authoritative records. A snapshot prevents
caller mutation while verification awaits; the plan's action list is frozen.

`validateDispatch` remains a structural validator, not an authentication API.
`deriveTaskStatus` and `verified:true` remain display contracts and grant no dispatch
authority. `verifyPilotArtifact` checks consistency with supplied runner context;
it does not authenticate an arbitrary artifact or establish a Codex run. Neither
boolean flags nor the injected callback interface provide cryptographic proof.
A real authenticated verifier, durable atomic store, executor and audit service
remain integration blockers. Tests use synthetic verifier/store/executor fixtures.

Review of PR #3 at `990b6fdd4876634483d15489f737a56691e40b79`: its workflows use
read-only contents permission and run Node tests/sandbox artifacts, with no deployment
step. Its dispatcher nevertheless allowed caller-controlled trust flags to reach
an injected executor. The new spoof regression failed before the fix (missing
expected rejection), then passed afterward. Local validation: 46 tests passed,
0 failed using `node --test --test-isolation=none agent-runtime/*.test.mjs`.
The required `node --test agent-runtime/*.test.mjs` also passed, reporting three
file-level tests in this environment. These results do not prove agent autonomy.

Execution reference available in this session: managed environment
`ccarenv_b64_Y2NhcmVudl84MDViYzQ2NmRkNTA4MTkxYjdkODBiMTlmMDNkNWFlNg`.
No separately verifiable Codex Cloud task/run URL or ID was exposed to this session;
that acceptance gate remains open and must not be substituted with a CI run ID.

## Trusted authorization and durable reservation — draft PR #7

`trusted-verifier.mjs` is a server-only composition of four *independently trusted* ports:

1. `identity.authenticate(serverSession)` — must authenticate a server-held session and resolve a real operator identity. `serverValidated` in the session object is merely an interface marker, not sufficient authentication.
2. `registry.loadAssignment(taskId)` and `registry.canDispatch(operator,company,division)` — must load an immutable approved task and authorize its scope.
3. `approvals.findApprovedDecision(taskId,principalId)` — must consult durable, authenticated Patrick approval records.
4. `github.verifyIssue(taskId,agentId,repository)` — must read GitHub evidence on the server through an authorized connector.

The verifier generates canonical fields from those services; browser-supplied `actor`, `approval` and `verifiedIssue` must never be accepted. The binding `bindTrustedDispatch` must only be called by server code with a genuine server-side session provider.

`postgres-store.mjs` supplies a PostgreSQL-compatible transaction adapter with atomic unique task reservations and append-only audit rows, based on `sql/001-agent-dispatch.sql`. This migration has NOT been applied. Tests simulate PostgreSQL queries and rollbacks; they are NOT integration tests against a live PostgreSQL service.

**Known limitations requiring engineering and approval before production**:
- No concrete authenticated session handler, identity provider, durable task/approval repositories or GitHub verification service have been wired.
- No real PostgreSQL connection, migration run, transaction concurrency test on PostgreSQL, backup/recovery or database-access policy has been verified.
- `dispatchApprovedTask` currently preserves ambiguous reservations for reconciliation but does not mark `RECONCILIATION_REQUIRED` durably; add a recovery process and audit before live use.
- A real Codex executor must return an independently verifiable task/run identifier; a GitHub Actions test ID is not Codex evidence.
- No secrets, live services or paid subscriptions should be activated from this draft PR. Patrick approval is required for deployment and any production migration.
