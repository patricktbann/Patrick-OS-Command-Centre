# Gmail Approval Worker — supervised local UAT

This pilot uses the existing Patrick OS Google desktop OAuth client. It requests
only `https://www.googleapis.com/auth/gmail.readonly`. It cannot send, delete,
label, or modify Gmail. No scheduler, production deployment, or business executor
is started. Existing subscription/free tooling only; billing is not enabled.

## Private setup

Keep credentials, tokens and SQLite UAT databases outside the public checkout.
Restrict the private directory to the current OS user (Windows ACL or mode 0700).
Never paste client secrets, tokens, message bodies or mailbox IDs into GitHub.

Run `python agent-runtime/gmail-readonly-oauth.py --credentials <private-client.json>
--token-path <private-token.json>` as one command. The user's system browser opens;
the user personally consents. A loopback listener checks random state and PKCE
before exchanging the code. Enrollment refuses to overwrite an existing token.

Run `node agent-runtime/gmail-reader-live-uat.mjs <private-token.json>
<private-client.json> <private-output-directory> [--refresh]` as one command.
`--refresh` exercises Google's actual refresh endpoint before reading Gmail.

## Trust and execution boundaries

The reader independently checks the authenticated Gmail profile. It verifies
only immutable message objects it obtained directly from Gmail, with the owner's
exact From address, SENT label, matching thread, and one unambiguous plain-text
MIME body. Incoming From-header spoofing, drafts, copied objects, HTML-only mail,
attachments and ambiguous MIME cannot authorize a decision. Mailbox compromise
or externally imported SENT mail are outside this local pilot's trust boundary;
this is not a cryptographic human signature or approval for high-risk actions.

The live runner searches up to 20 recent owner-sent UAT/test threads. It replays
one clearly marked test decision through the existing local SQLite coordinator,
reopens the database to verify persistence, denies duplicates and forged objects,
and permits only a single synthetic task completion. It never binds real business
tasks, sends a request, or creates a real commitment. Existing test mail replay is
not proof of a newly solicited email round trip or an unattended production worker.

If no suitable test email exists, send a self-addressed message manually from the
authorized account, subject `Patrick OS UAT — TSY-AI-9901`, first body line
`APPROVE TSY-AI-9901`. The runner exits 2 while this external fixture is absent;
profile/search success alone must not be reported as complete end-to-end UAT.

## Verification

Run `node --test agent-runtime/gmail-readonly-reader.test.mjs
agent-runtime/local-approval-coordinator.test.mjs agent-runtime/local-approval-store.test.mjs`.
Tests inject fixtures and do not contact Google. PostgreSQL integration remains
separate and requires the repository's isolated GitHub Actions service.

Google references:
- https://developers.google.com/identity/protocols/oauth2/native-app
- https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.threads/get
