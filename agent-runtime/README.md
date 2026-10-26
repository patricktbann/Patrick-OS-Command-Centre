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
