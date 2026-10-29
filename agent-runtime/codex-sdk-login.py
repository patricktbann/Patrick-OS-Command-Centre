#!/usr/bin/env python3
"""Explicit local ChatGPT sign-in for Codex SDK. Never prints session secrets."""
from __future__ import annotations
import argparse
import os
import sys

def main():
    ap=argparse.ArgumentParser(description="Authenticate official Codex Python SDK with existing ChatGPT login")
    ap.add_argument("--device-code",action="store_true",help="Use device code on a second browser/device")
    args=ap.parse_args()
    if os.environ.get("OPENAI_API_KEY"):
        raise RuntimeError("API-key usage is not authorized for this pilot. Unset OPENAI_API_KEY.")
    try:
        from openai_codex import Codex
    except ImportError as e:
        raise RuntimeError("Install official SDK locally: python -m pip install openai-codex") from e
    with Codex() as codex:
        if args.device_code:
            handle=codex.login_chatgpt_device_code()
            print("Open this URL in your own browser:",handle.verification_url,flush=True)
            print("Enter this device code:",handle.user_code,flush=True)
        else:
            handle=codex.login_chatgpt()
            print("Open this authorization URL in your own browser:",handle.auth_url,flush=True)
        result=handle.wait()
        if result.success is not True:
            raise RuntimeError("ChatGPT Codex login did not complete successfully")
        print("CHATGPT_CODEX_LOGIN_CONFIRMED. No secrets printed.")
    return 0

if __name__=="__main__":
    try:
        sys.exit(main())
    except Exception as e:
        print("CODEX_LOGIN_BLOCKED:",str(e),file=sys.stderr)
        sys.exit(1)
