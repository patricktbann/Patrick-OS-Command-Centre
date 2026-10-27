# UAT only. Run INTERACTIVELY under the PatrickTeo Windows user.
# Never pass the GitHub OAuth secret via command line, chat, environment,
# GitHub repository, process output, log or Desktop Commander.
$ErrorActionPreference = 'Stop'
$dest = Join-Path $env:LOCALAPPDATA 'PatrickOS\UAT'
$target = Join-Path $dest 'github-oauth-client-secret.dpapi'
Write-Host ''
Write-Host 'Patrick OS AI Office UAT - LOCAL GitHub OAuth Client Secret' -ForegroundColor Cyan
Write-Host 'Paste the secret generated at GitHub. Characters will not appear.' 
Write-Host 'Saved only as Windows DPAPI encrypted data for your current Windows account.'
Write-Host 'Do not type it into ChatGPT or a remote terminal.'
Write-Host ''
if (Test-Path $target) {
  Write-Host 'An encrypted secret already exists. Refusing to overwrite automatically.' -ForegroundColor Yellow
  Write-Host 'No changes made.'
  exit 2
}
$secure = Read-Host 'Client Secret (hidden)' -AsSecureString
if ($null -eq $secure -or $secure.Length -lt 20) {
  Write-Host 'Secret not saved: blank or unexpectedly short.' -ForegroundColor Red
  exit 3
}
New-Item -ItemType Directory -Path $dest -Force | Out-Null
# Windows DPAPI, bound to the current Windows user profile; no portable key.
$encrypted = ConvertFrom-SecureString -SecureString $secure
$temporary = Join-Path $dest ('secret-' + [guid]::NewGuid().ToString('N') + '.tmp')
try {
  [System.IO.File]::WriteAllText($temporary, $encrypted, [System.Text.Encoding]::ASCII)
  Move-Item -LiteralPath $temporary -Destination $target -ErrorAction Stop
} finally {
  Remove-Item -LiteralPath $temporary -Force -ErrorAction SilentlyContinue
  $secure.Dispose()
}
Write-Host ''
Write-Host 'LOCAL_OAUTH_SECRET_DPAPI_ENROLLED' -ForegroundColor Green
Write-Host 'Path: %LOCALAPPDATA%\PatrickOS\UAT\github-oauth-client-secret.dpapi'
Write-Host 'Secret value was never displayed, logged or sent to ChatGPT.'
