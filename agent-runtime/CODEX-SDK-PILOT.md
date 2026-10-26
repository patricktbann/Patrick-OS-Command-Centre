# Codex SDK read-only bridge: live login gate

This pilot uses OpenAI's **official Codex Python SDK** on an operator-controlled machine. It is a real supported execution mechanism **only after** an existing ChatGPT Codex login is available. It is **not** the Codex Cloud task API and does **not** wire the TSY website to Codex. Do not mistake a thread ID for a Codex Cloud task ID.

References:
- https://learn.chatgpt.com/docs/codex-sdk
- https://github.com/openai/codex/blob/main/sdk/python/docs/getting-started.md
- https://help.openai.com/en/articles/20001545-using-codex-cloud

## Operator-controlled proof

1. Check out the repo and switch to the V3.5 feature branch. Confirm the working tree is clean.
2. Use Python 3.10+ to install `openai-codex` in a virtual environment.
3. Authenticate **locally** using `python agent-runtime/codex-sdk-login.py --device-code` (or without `--device-code` to use browser login). The script prints the official verification URL and device code only on your own machine. Do not paste a session credential or token into GitHub, ChatGPT or the public Pages interface.
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

## What Patrick must authorize

The connected GitHub app can save source and verify CI, but **cannot complete interactive Codex SDK login from this conversation**. To close the live session acceptance gate, use an authorized computer where Python and Git are installed:

```sh
python -m pip install openai-codex
python agent-runtime/codex-sdk-login.py --device-code
python agent-runtime/codex-sdk-readonly-pilot.py
python agent-runtime/codex-sdk-readonly-pilot.py --execute
```

These commands must be run from a clean checkout on a nonproduction `feature/v3.5-` branch of `patricktbann/Patrick-OS-Command-Centre`. No web-hosted Pages UI, public callback or personal tokens are involved. The repository pilot refuses to run when `OPENAI_API_KEY` is set. The real SDK thread ID is only available after the user-authorized host completes a turn.

**Approval distinction:** logging in to Codex only authorizes the personal SDK session. It is NOT Patrick's approval to dispatch production workloads, merge PRs or incur separately billed API charges. Those remain controlled independently.
