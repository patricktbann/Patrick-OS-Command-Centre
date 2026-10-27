# Private UAT readiness check. No secret value is loaded or printed.
# Fail closed. Never installs services, writes databases or starts OAuth listeners.
$ErrorActionPreference='Stop'
$expected='C:\\PatrickOS-UAT'
$secret=Join-Path $env:LOCALAPPDATA 'PatrickOS\UAT\github-oauth-client-secret.dpapi'
function flag([string]$key,[bool]$ok){
  if($ok){ Write-Output ($key+'=READY') } else { Write-Output ($key+'=MISSING') }
}
$repo=(Test-Path (Join-Path $expected 'agent-runtime\private-uat-auth-router.mjs'))
$node=$null
try { $node=Get-Command node -ErrorAction Stop } catch {}
$protected=Test-Path -LiteralPath $secret -PathType Leaf
$dpapi=$false
if($protected){
 try {
  $encrypted=[System.IO.File]::ReadAllText($secret)
  $secure=ConvertTo-SecureString -String $encrypted -ErrorAction Stop
  $dpapi=$secure.Length -ge 20
  $secure.Dispose()
 }catch {$dpapi=$false}
}
# No automatic certificates: local trusted root must be manually reviewed.
$certPath=Join-Path $env:LOCALAPPDATA 'PatrickOS\UAT\tls\localhost.crt'
$keyPath=Join-Path $env:LOCALAPPDATA 'PatrickOS\UAT\tls\localhost.key'
$tls=(Test-Path -LiteralPath $certPath -PathType Leaf) -and
     (Test-Path -LiteralPath $keyPath -PathType Leaf)
# UAT-only PostgreSQL connection settings must exist in local protected config,
# not in source control. Presence is not connectivity or database attestation.
$config=Join-Path $env:LOCALAPPDATA 'PatrickOS\UAT\postgres-uat.config.dpapi'
$pgConfig=Test-Path -LiteralPath $config -PathType Leaf
$listener=Get-NetTCPConnection -LocalAddress '127.0.0.1' -LocalPort 18443 -State Listen -ErrorAction SilentlyContinue
flag 'REPOSITORY' $repo
flag 'NODEJS' ($null -ne $node)
flag 'OAUTH_SECRET_DPAPI' $dpapi
flag 'TLS_LOCAL_FILES' $tls
flag 'POSTGRES_UAT_CONFIG' $pgConfig
if($null -ne $listener){Write-Output 'HTTPS_PORT_18443=IN_USE'}else{Write-Output 'HTTPS_PORT_18443=AVAILABLE'}
if($repo -and $node -and $dpapi -and $tls -and $pgConfig -and $null -eq $listener){
 Write-Output 'PRIVATE_UAT_STATIC_PREFLIGHT=READY'
 Write-Output 'NO_SERVICES_STARTED_NO_SECRETS_DISCLOSED_NO_DATABASE_WRITTEN'
 exit 0
}else{
 Write-Output 'PRIVATE_UAT_STATIC_PREFLIGHT=HOLD'
 Write-Output 'NO_SERVICES_STARTED_NO_SECRETS_DISCLOSED_NO_DATABASE_WRITTEN'
 exit 2
}
