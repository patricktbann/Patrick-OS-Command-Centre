#!/usr/bin/env python3
"""Optional, manually started Codex SDK proof of execution (READ ONLY).

This is NOT Codex Cloud's managed task API. It runs on an operator-controlled
machine with an existing ChatGPT-authenticated Codex SDK session. It will not
sign in, request an API key, commit, push, merge, or deploy.
"""
from __future__ import annotations
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
from datetime import datetime, timezone

EXPECTED_REPOSITORY = "patricktbann/Patrick-OS-Command-Centre"
BASELINE = "feature/v3.5-official-codex-sdk-readonly-pilot"
DEFAULT_TASK = (
    "Read only: inspect the V3.5 agent-runtime and produce a security review. "
    "Do not modify files, create commits, push, deploy, merge or invoke external services. "
    "Report specific remaining blockers for a genuine authenticated Codex executor."
)

def git(*args: str) -> str:
    return subprocess.check_output(["git", *args], text=True).strip()

def preflight(root: Path) -> dict:
    if not (root / ".git").exists():
        raise RuntimeError("Run only inside a local checkout of the authorized repository")
    top = Path(git("-C", str(root), "rev-parse", "--show-toplevel")).resolve()
    if top != root:
        raise RuntimeError("Run from repository root")
    branch = git("-C", str(root), "branch", "--show-current")
    if not branch.startswith("feature/v3.5-"):
        raise RuntimeError("Only non-production V3.5 feature branches allowed")
    if git("-C", str(root), "status", "--porcelain"):
        raise RuntimeError("Working tree must be clean before Codex session")
    origin = git("-C", str(root), "remote", "get-url", "origin")
    if EXPECTED_REPOSITORY not in origin:
        raise RuntimeError("Wrong GitHub origin")
    return {"repository":EXPECTED_REPOSITORY,"branch":branch,
            "headSha":git("-C",str(root),"rev-parse","HEAD")}

def main() -> int:
    ap=argparse.ArgumentParser(description="Manual authenticated read-only Codex SDK pilot")
    ap.add_argument("--execute", action="store_true", help="Explicitly authorize a read-only SDK run")
    ap.add_argument("--output", default="codex-pilot-evidence.json",
                    help="Local evidence file (never commit or upload automatically)")
    args=ap.parse_args()
    root=Path.cwd().resolve()
    ctx=preflight(root)
    if not args.execute:
        print(json.dumps({"status":"READY_NOT_EXECUTED","context":ctx,
                          "reason":"Pass --execute after local ChatGPT Codex sign-in."},indent=2))
        return 0
    if os.environ.get("OPENAI_API_KEY"):
        raise RuntimeError("Refusing API-key billed route; unset OPENAI_API_KEY and use ChatGPT Codex login.")
    try:
        from openai_codex import Codex, Sandbox
    except ImportError as e:
        raise RuntimeError("Install official SDK with: python -m pip install openai-codex") from e
    with Codex() as codex:
        # SDK reuses already authenticated account; no automatic authorization.
        thread=codex.thread_start(sandbox=Sandbox.read_only)
        result=thread.run(DEFAULT_TASK)
        evidence={
            "schemaVersion":"3.5-official-sdk-pilot-1",
            "status":"CODEX_SDK_READONLY_TURN_COMPLETED",
            "scope":"local-sdk-not-cloud-task",
            "repository":ctx["repository"],
            "branch":ctx["branch"],
            "headShaBefore":ctx["headSha"],
            "headShaAfter":git("-C",str(root),"rev-parse","HEAD"),
            "threadId":thread.id,
            "finishedAt":datetime.now(timezone.utc).isoformat(),
            "finalResponse":result.final_response,
            "itemsCount":len(result.items),
            "isCodexCloudTask":False,
            "isApprovedForDeployment":False
        }
    if git("-C", str(root), "status", "--porcelain"):
        raise RuntimeError("Read-only run left unexpected working tree changes; inspect before saving evidence")
    if evidence["headShaAfter"]!=evidence["headShaBefore"]:
        raise RuntimeError("Repository HEAD changed during read-only run")
    output=Path(args.output).resolve()
    if output.parent!=root:
        raise RuntimeError("Evidence output must be at repository root")
    if output.exists():
        raise RuntimeError("Refusing to overwrite an existing evidence file")
    output.write_text(json.dumps(evidence,indent=2)+"\n",encoding="utf-8")
    print(json.dumps({"status":evidence["status"],"threadId":thread.id,
                      "evidenceFile":str(output),"cloudTask":False},indent=2))
    return 0

if __name__=="__main__":
    try:
        sys.exit(main())
    except Exception as exc:
        print(f"NOT EXECUTED OR FAILED: {exc}",file=sys.stderr)
        sys.exit(1)
