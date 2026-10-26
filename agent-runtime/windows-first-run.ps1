param([switch]$RunAuthenticatedPilot)
$ErrorActionPreference = 'Stop'
Write-Host "Patrick OS V3.5 — authorized Windows UAT host preflight"
if ($env:OPENAI_API_KEY) { throw "OPENAI_API_KEY is set; refusing to use separately billed API credentials." }
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw "Git is not installed. Install Git for Windows first." }
if (-not (Get-Command py -ErrorAction SilentlyContinue) -and -not (Get-Command python -ErrorAction SilentlyContinue)) { throw "Python 3.10+ is required." }
$python = if (Get-Command py -ErrorAction SilentlyContinue) { 'py' } else { 'python' }
& $python --version
if ($LASTEXITCODE -ne 0) { throw "Python cannot launch." }
$version = & $python -c "import sys;print('1' if sys.version_info >= (3,10) else '0')"
if ($LASTEXITCODE -ne 0 -or $version -ne '1') { throw "Python 3.10+ required." }
$repo = (git rev-parse --show-toplevel 2>$null)
if ($LASTEXITCODE -ne 0) { throw "Run this only from your cloned Patrick-OS-Command-Centre repository root." }
$origin = git remote get-url origin
if ($LASTEXITCODE -ne 0) { throw "No Git origin configured." }
if ($origin -notmatch '^(https://github[.]com/|git@github[.]com:|ssh://git@github[.]com/)patricktbann/Patrick-OS-Command-Centre([.]git)?$') { throw "Unexpected remote repository." }
$branch = git branch --show-current
if (-not $branch.StartsWith('feature/v3.5-')) { throw "Refusing non V3.5 feature branch." }
$dirty = git status --porcelain
if ($dirty) { throw "Working tree is not clean. Do not run a test on modified files." }
Write-Host "Verified checkout: $origin, branch $branch"
Write-Host "SAFE PREFLIGHT PASSED. No credentials printed or Codex execution started."
if (-not $RunAuthenticatedPilot) {
    Write-Host "Next: install official SDK (python -m pip install openai-codex), then invoke this script with -RunAuthenticatedPilot."
    exit 0
}
& $python -c "import openai_codex;print('SDK installed')"
if ($LASTEXITCODE -ne 0) { throw "Official Codex SDK is missing. Install it first." }
Write-Host "Device-code authentication will now require your own ChatGPT approval in your browser."
& $python agent-runtime/codex-sdk-login.py --device-code
if ($LASTEXITCODE -ne 0) { throw "Codex authentication failed." }
& $python agent-runtime/codex-sdk-readonly-pilot.py
if ($LASTEXITCODE -ne 0) { throw "SDK pilot preflight failed." }
& $python agent-runtime/codex-sdk-readonly-pilot.py --execute
if ($LASTEXITCODE -ne 0) { throw "Genuine read-only SDK execution did not pass." }
Write-Host "SDK pilot command exited successfully. Brain QA must independently verify redacted evidence before release."
