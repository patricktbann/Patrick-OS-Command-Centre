# Explicit Windows UAT launcher. No production, NAS, dispatch or unattended startup.
$ErrorActionPreference='Stop'
$base=Join-Path $env:LOCALAPPDATA 'PatrickOS\UAT'
$oauthFile=Join-Path $base 'github-oauth-client-secret.dpapi'
$pgFile=Join-Path $base 'oauth-runtime-db.config.dpapi'
$idFile=Join-Path $base 'github-oauth-client-id.txt'
$script='C:\PatrickOS-UAT-v36\agent-runtime\live-local-oauth-uat.mjs'
if(!(Test-Path $oauthFile) -or !(Test-Path $pgFile) -or !(Test-Path $script)){
 throw 'Required local UAT secret, restricted DB config or server code missing'
}
if(!(Test-Path $idFile)){
 Write-Host 'Enter the public OAuth Client ID displayed on the GitHub OAuth App page:'
 $clientId=(Read-Host 'GitHub OAuth Client ID').Trim()
 if($clientId -notmatch '^Ov23[a-zA-Z0-9]{12,40}$'){throw 'Unexpected GitHub OAuth Client ID format'}
 [IO.File]::WriteAllText($idFile,$clientId,[Text.Encoding]::ASCII)
}
$clientId=([IO.File]::ReadAllText($idFile)).Trim()
if($clientId -notmatch '^Ov23[a-zA-Z0-9]{12,40}$'){throw 'Client ID invalid'}
function Unprotect([string]$path) {
 $secure=ConvertTo-SecureString ([IO.File]::ReadAllText($path)) -ErrorAction Stop
 $ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
 try{return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)}
 finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr);$secure.Dispose()}
}
try{
 $env:PATRICK_UAT_OAUTH_CLIENT_ID=$clientId
 $env:PATRICK_UAT_OAUTH_SECRET=Unprotect $oauthFile
 $env:PATRICK_UAT_PG_PASSWORD=Unprotect $pgFile
 Write-Output 'STARTING_PRIVATE_GITHUB_OAUTH_UAT'
 Write-Output 'BROWSER_URL=https://127.0.0.1:18443/auth/github/start'
 & node $script
 if($LASTEXITCODE -ne 0){throw 'Private UAT server was not started'}
}finally{
 Remove-Item Env:PATRICK_UAT_OAUTH_CLIENT_ID -ErrorAction SilentlyContinue
 Remove-Item Env:PATRICK_UAT_OAUTH_SECRET -ErrorAction SilentlyContinue
 Remove-Item Env:PATRICK_UAT_PG_PASSWORD -ErrorAction SilentlyContinue
}
