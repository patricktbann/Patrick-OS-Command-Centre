# Codex SDK read-only bridge: live login gate

This pilot uses OpenAI's **official Codex Python SDK** on an operator-controlled machine. It is a real supported execution mechanism **only after** an existing ChatGPT Codex login is available. It is **not** the Codex Cloud task API and does **not** wire the TSY website to Codex. Do not mistake a thread ID for a Codex Cloud task ID.

References:
- https://learn.chatgpt.com/docs/codex-sdk
- https://github.com/openai/codex/blob/main/sdk/python/docs/getting-started.md
- https://help.openai.com/en/articles/20001545-using-codex-cloud

## Operator-controlled proof

1. Check out the repo and switch to the V3.5 feature branch. Confirm the working tree is clean.
2. Use Python 3.10+ to install `openai-codex` in a virtual environment.
3. Authenticate **locally** using the SDK's `codex.login_chatgpt()` or device-code login if not already signed in; do not paste a credential or token into GitHub, ChatGPT or the public Pages interface.
4. Run `python agent-runtime/codex-sdk-readonly-pilot.py`. It prints **READY_NOT_EXECUTED** without contacting Codex.
5. Only after reviewing the environment and authorized usage, run `python agent-runtime/codex-sdk-readonly-pilot.py --execute`. The SDK starts one **read-only** coding review session with an authentic thread ID. It does not edit, push, merge, deploy or create paid API-key access.
6. The program writes `codex-pilot-evidence.json` locally and Git ignores it. The operator should review and redact its contents before providing a specific run/thread reference to Brain QA.

### Hard blocks

- Never run automatically from GitHub Pages or unauthenticated public APIs.
- Do not enable `openai/codex-action@v1` under the existing no-additional-API-billing constraint: the documented Action requires `OPENAI_API_KEY` and separate API usage billing.
- Do not place personal Codex login credentials or cookies into CI secrets or repo files.
- Do not report the official SDK as Codex Cloud task submission.
- Passing Python syntax or CI tests proves this **script compiles**, not that a Codex SDK session actually ran.
- Production identity, approval storage, live executor service and end-to-end Patrick UAT are still missing.

A functioning interactive SDK session is the next approval/authentication hinge. Neither a verified provider task nor a production integration exists until its authorized executor actually runs.
