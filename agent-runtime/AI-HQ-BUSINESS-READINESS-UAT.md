# AI HQ Business Readiness — UAT Contract
Owner authorization: Patrick, 2026-10-29. Tracking: #35.

## Objective
A real AI staff member completes one low-risk internal assignment under authenticated principal authority with verifiable output, independent QA, durable approval and exactly-once synthetic release. Fixture-only execution and Gmail replay do not qualify.

## Acceptance gates
- [ ] Authenticated private UAT service, durable assignment and audit
- [ ] Genuine supported executor run with independently verified run ID and output
- [ ] Intake -> assignment -> execution -> output -> QA -> principal approval -> one-time synthetic release
- [ ] Company/division isolation, unauthorized access and injection denial
- [ ] Restart recovery, idempotency, failure reconciliation, health and stop control
- [ ] UI accurately displays trusted states; Patrick accepts navigation
- [ ] Reproducible nonproduction end-to-end evidence and Patrick sign-off

## Restrictions
No external emails, payments, contracts, production deployment, billing, paid API activation or destructive migrations. Preserve frozen V3.4 UI. Do not store credentials or tokens in GitHub.

## Verified prerequisite
V3.6 live Gmail TSY-AI-9902 synthetic approval passed; 287 local tests passed; GitHub CI run 40842948177 including ephemeral PostgreSQL passed. Not evidence of business-ready AI autonomy.

Do not claim 100% until every applicable gate has verifiable evidence.