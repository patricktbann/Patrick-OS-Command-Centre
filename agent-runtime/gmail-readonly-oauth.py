"""Local Gmail read-only enrollment. Tokens stay in a private, external path."""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import secrets
import time
import urllib.parse
import urllib.request
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer

SCOPE = "https://www.googleapis.com/auth/gmail.readonly"


def enroll(credentials, token_path):
    config = json.loads(Path(credentials).read_text(encoding="utf-8-sig"))["installed"]
    if config.get("auth_uri") != "https://accounts.google.com/o/oauth2/auth" or config.get("token_uri") != "https://oauth2.googleapis.com/token":
        raise ValueError("UNEXPECTED_GOOGLE_ENDPOINT")
    if Path(token_path).exists():
        raise ValueError("TOKEN_ALREADY_EXISTS_REVIEW_BEFORE_REPLACING")
    state = secrets.token_urlsafe(32)
    verifier = secrets.token_urlsafe(64)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")
    result = {}

    class Callback(BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass  # Never log authorization codes or state.

        def do_GET(self):
            parsed = urllib.parse.urlsplit(self.path)
            query = urllib.parse.parse_qs(parsed.query)
            valid = parsed.path == "/callback" and secrets.compare_digest(query.get("state", [""])[0], state)
            if valid:
                result.update(query)
            self.send_response(200 if valid else 400)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Referrer-Policy", "no-referrer")
            self.end_headers()
            self.wfile.write(b"Patrick OS: consent received. You may close this tab." if valid else b"Invalid callback.")

    with HTTPServer(("127.0.0.1", 0), Callback) as server:
        server.timeout = 1
        redirect = f"http://127.0.0.1:{server.server_port}/callback"
        url = config["auth_uri"] + "?" + urllib.parse.urlencode({
            "client_id": config["client_id"], "redirect_uri": redirect,
            "response_type": "code", "scope": SCOPE, "access_type": "offline",
            "prompt": "consent", "state": state, "code_challenge": challenge,
            "code_challenge_method": "S256", "login_hint": "patricktbann@gmail.com",
        })
        print("GOOGLE_PROJECT=" + config.get("project_id", "UNKNOWN"), flush=True)
        print("WAITING_FOR_PERSONAL_GOOGLE_CONSENT; scope=gmail.readonly", flush=True)
        if not webbrowser.open(url):
            raise RuntimeError("BROWSER_OPEN_FAILED")
        deadline = time.monotonic() + 900
        while not result and time.monotonic() < deadline:
            server.handle_request()
    if "code" not in result:
        raise RuntimeError("CONSENT_DENIED_OR_TIMED_OUT")
    body = urllib.parse.urlencode({
        "client_id": config["client_id"], "client_secret": config["client_secret"],
        "code": result["code"][0], "code_verifier": verifier,
        "redirect_uri": redirect, "grant_type": "authorization_code",
    }).encode()
    request = urllib.request.Request(config["token_uri"], data=body, method="POST")
    with urllib.request.urlopen(request, timeout=30) as response:
        token = json.load(response)
    if set(token.get("scope", "").split()) != {SCOPE}:
        raise RuntimeError("UNEXPECTED_GRANTED_SCOPE")
    if not token.get("access_token") or not token.get("refresh_token"):
        raise RuntimeError("INCOMPLETE_TOKEN_RESPONSE")
    token["expires_at"] = time.time() + token.get("expires_in", 0)
    target = Path(token_path)
    target.parent.mkdir(parents=True, exist_ok=True)
    fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w") as output:
        json.dump(token, output)
    print("OAUTH_TOKEN_SAVED_PRIVATELY; LIVE_GMAIL_UAT_NOT_YET_RUN", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--credentials", required=True)
    parser.add_argument("--token-path", required=True)
    args = parser.parse_args()
    try:
        enroll(args.credentials, args.token_path)
    except Exception as error:
        print("OAUTH_FAILED: " + type(error).__name__, flush=True)
        raise SystemExit(1)
