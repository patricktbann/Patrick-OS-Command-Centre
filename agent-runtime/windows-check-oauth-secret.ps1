# Local verification only. Does not reveal, export or print the GitHub secret.
$ErrorActionPreference = 'Stop'
$target = Join-Path $env:LOCALAPPDATA 'PatrickOS\UAT\github-oauth-client-secret.dpapi'
if (-not (Test-Path -LiteralPath $target -PathType Leaf)) {
 Write-Output 'OAUTH_SECRET_NOT_ENROLLED'
 exit 3
}
try {
 $encrypted = [System.IO.File]::ReadAllText($target)
 $secure = ConvertTo-SecureString -String $encrypted -ErrorAction Stop
 if ($secure.Length -lt 20) { throw 'Invalid secret length' }
 $secure.Dispose()
 Write-Output 'OAUTH_SECRET_DPAPI_VALID_FOR_CURRENT_WINDOWS_USER'
} catch {
 Write-Output 'OAUTH_SECRET_DPAPI_INVALID_OR_WRONG_WINDOWS_USER'
 exit 2
}
