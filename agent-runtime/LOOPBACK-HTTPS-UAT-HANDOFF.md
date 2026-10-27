# Private HTTPS loopback UAT host — engineering handoff

This branch adds `createLoopbackHttpsUatHost`, a restricted HTTPS listener factory. **Importing it does not start a server.** The listener can bind only to `127.0.0.1` or `::1`; no public interface, CDN, GitHub Pages, cloud deployment, or NAS.

## Before any live authentication
- Patrick approves one GitHub OAuth App and its exact callback URL. A GitHub OAuth App is an external identity registration and requires personal authorization.
- Select the actual UAT origin and HTTPS certificate. The existing router requires an exact origin; for local testing use `https://127.0.0.1:8443` with a certificate valid for that IP, **only if GitHub accepts the registered callback**. Avoid guessing an OAuth callback address.
- Set issuer `redirectUri` and router `origin` identically. Never hardcode secrets in files, commits or command-line arguments. Do not copy browser session material from ChatGPT.
- Use an approved **nonproduction** PostgreSQL database with migrations 001–005. The CI DB superuser credentials are disposable and may never be reused for real UAT. Before real use, enforce least-privilege DB roles and audit protections.
- Supply the private server with certificate/key bytes from private filesystem, secure OAuth app configuration, exact numeric GitHub account ID, trusted PostgreSQL session identity, and private router.
- Instantiate the host with `hostname:'127.0.0.1'`, `port:8443`, and validated TLS; start only through an authorized local operator. Confirm network isolation and certificate trust.
- Keep all state-changing task/approval/dispatch endpoints **absent**. This host supports private login tests only.
- Human QA verifies genuine GitHub authorization consent, exact identity, callback, session expiry, logout/revocation and deny/replay tests.

## Unmet security controls
This is a **loopback-only UAT component**, not a production service or deployment. A server operator is still required to compose the OAuth issuer, PostgreSQL pool, router and TLS listener, and ensure secrets are securely injected. CI verifies contract behavior but not live GitHub OAuth or an actual HTTPS socket. Do not label CI tests as a real signed-in Patrick session.

Also unresolved: approval revocation after reservation, end-to-end governed task attestation and host sandbox controls. No paid API service, autonomous operation, public hosting, merge, production deployment or NAS migration is authorized.
