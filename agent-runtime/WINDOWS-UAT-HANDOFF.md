# Patrick OS V3.5 — first genuine Codex UAT on Windows

This stage requires no NAS and does not deploy or merge anything. It checks whether a real local Codex SDK turn can operate under Patrick's own ChatGPT authorization.

**Do not run these steps on a shared/public computer, NAS, or production machine.** Keep all SDK credentials on the authorized development computer.

## Step 1 — Confirm local environment
Open PowerShell at the root of a **clean clone** of `patricktbann/Patrick-OS-Command-Centre`, checked out to a `feature/v3.5-` branch that includes this file.

Run:
```powershell
powershell -NoProfile -File agent-runtime/windows-first-run.ps1
```
This verifies Python >=3.10, Git, exact GitHub repository origin, non-production branch, clean working tree and no `OPENAI_API_KEY` environment variable.

## Step 2 — Install official SDK
```powershell
py -m pip install openai-codex
```
This installs the official package and pinned Codex runtime on your own machine. Check package trust and data handling before installation; do not install silently or purchase extra services.

## Step 3 — Personal sign-in and genuine read-only task
```powershell
powershell -NoProfile -File agent-runtime/windows-first-run.ps1 -RunAuthenticatedPilot
```
You will need to complete the interactive ChatGPT device-code login in your browser. This launches a single read-only SDK task and stores `codex-pilot-evidence.json` locally (ignored by Git).

**Never share the device code, cookies or authentication files in GitHub.** Review and redact the local evidence before sharing the thread ID and repository SHA for independent QA.

## Pass/fail criteria
- The SDK task must complete with a real thread ID and final output.
- The repository HEAD and working tree must remain unchanged.
- No API-key billing, production deployment, PR merge, or write permissions are used.
- Brain QA must independently verify the thread, output, account authentication and repository context.
- Any failed check remains a blocker; a syntax/CI pass does not count as a live Codex test.

If Codex requires user authentication, this is the explicit handoff point. Later, the official SDK transport must be composed into a secured backend; the local pilot alone is not full AI Office automation.
