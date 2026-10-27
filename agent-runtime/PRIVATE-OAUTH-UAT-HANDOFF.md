# V3.5 — Private OAuth callback integration checklist (NOT deployed)

## Demonstrated in isolated development
- GitHub OAuth authorization-code issuer: exact configured numeric GitHub account ID, single-use 5-minute state, short-lived local session token, token hash only in PostgreSQL.
- Private callback: browser-bound state cookie (Secure, HttpOnly, SameSite=Lax because the GitHub GET redirect is cross-site), no callback token in HTML; final session cookie Secure, HttpOnly, SameSite=Strict.
- Authenticated requests: session token only from private server cookie parser, then independent PostgreSQL lookup for expiry and revocation.
- Logout: POST + exact expected Origin with server-side session revocation.
- No real login issued during CI. Mock identity provider only, no personal token retained.

## Hard requirements before live UAT (Principal approval and account linking)
1. Patrick approves creation of a GitHub OAuth App owned by the appropriate account or organization. Choose the private HTTPS callback origin; do NOT use GitHub Pages as the backend. Configure a single exact callback URL, e.g. `https://<private-domain>/auth/github/callback`. (Placeholder only; no domain has been selected.)
2. The OAuth App's **client ID and client secret** are provided to a secure private server secret manager, never chat, source code, browser, public Pages, logs or GitHub issue text. Select the numeric GitHub ID and the internal approved Principal ID from a separate trusted policy.
3. Deploy and QA a private HTTPS backend with a TLS certificate and a strict trusted-origin allowlist. The server—not HTTP body or forwarded spoofable headers—must set `secureTransport=true`. All cookies must remain host-only with `Path=/`.
4. Install PostgreSQL migrations 001–005 **only on approved nonproduction UAT database**. Configure separate minimally privileged DB roles for auth issuance, session verification and governed reservations; do not use the CI superuser in production. Protect authorization and dispatch audit against update/delete by runtime roles.
5. Bind the issuer to the HTTPS GET `/auth/github/start`, callback GET `/auth/github/callback`, and logout POST endpoints **only** within private server routes. Use `createPrivateOAuthCallback` with exact origin and the session verifier. Do not serve any OAuth secrets or token from GitHub Pages.
6. For any future state-changing POST, enforce CSRF tokens, exact Origin, authorization and content-type protections. Rate-limit login and callback, scrub query strings/cookies from logs, configure security headers and avoid browser caches. Ensure callback pages cannot leak the OAuth code in Referer (no-referrer).
7. Patrick personally authorizes GitHub OAuth consent. Verify exact user ID, issue session, verify expired/revoked denial, logout, browser restart behavior, concurrent logins and lockout.
8. Before connecting to Codex SDK runtime: close end-to-end assignment/approval/GitHub issue attestation, atomic DB reservation, container/sandbox host restrictions, idempotency after uncertain responses and cancellation/approval cutoff semantics. Do a single fixed read-only UAT with Patrick's review.
9. Keep PRs draft until the above pass; V3.4 remains frozen. Never deploy, start paid API billing, merge, run NAS migration or create contractual commitments automatically.

## Critical boundaries
- The verified GitHub ID is used for **AI Office identity only**, not ChatGPT or Codex entitlement.
- The current code is an injected callback handler, **not a listening HTTP server**.
- The issuer has no production OAuth client details, live token, callback route or signed-off UAT.
- A signed-in Principal is not automatically a currently approved task. The governed reservation gate still applies.
