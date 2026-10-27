# Windows user-scoped AI Office UAT DB role. Not production/NAS.
# Run once; refuse overwriting an existing role or encrypted credential.
$ErrorActionPreference='Stop'
$base=Join-Path $env:LOCALAPPDATA 'PatrickOS\UAT'
$adminFile=Join-Path $base 'postgres-uat.config.dpapi'
$runtimeFile=Join-Path $base 'oauth-runtime-db.config.dpapi'
if(Test-Path $runtimeFile){throw 'Runtime credential already exists; refusing replacement'}
$psql=Get-ChildItem (Join-Path $base 'postgres-portable') -Recurse -Filter psql.exe -File|Select-Object -First 1 -ExpandProperty FullName
if(!$psql){throw 'PostgreSQL client not installed'}
$adminSecure=ConvertTo-SecureString ([IO.File]::ReadAllText($adminFile))
$adminPtr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($adminSecure)
try{
 $admin=([Runtime.InteropServices.Marshal]::PtrToStringBSTR($adminPtr)|ConvertFrom-Json)
 $env:PGPASSWORD=$admin.password
 $roleExists=(& $psql -h 127.0.0.1 -p 55432 -U uat_admin -d patrickos_uat -w -tAc "SELECT 1 FROM pg_roles WHERE rolname='uat_oauth_runtime'")
 if("$roleExists".Trim() -eq '1'){throw 'Runtime role already exists; refusing replacement'}
 $rand=New-Object byte[] 48
 $rng=[Security.Cryptography.RandomNumberGenerator]::Create()
 $rng.GetBytes($rand);$rng.Dispose()
 $password=[Convert]::ToBase64String($rand).TrimEnd('=').Replace('+','-').Replace('/','_')
 # Base64url is safe for a single-quoted SQL literal.
 $commands=@(
  "CREATE ROLE uat_oauth_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '$password';",
  'GRANT CONNECT ON DATABASE patrickos_uat TO uat_oauth_runtime;',
  'GRANT USAGE ON SCHEMA public TO uat_oauth_runtime;',
  'GRANT SELECT,INSERT,UPDATE ON TABLE agent_oauth_login_state,agent_private_session TO uat_oauth_runtime;'
 )
 $commands | & $psql -h 127.0.0.1 -p 55432 -U uat_admin -d patrickos_uat -w -q -v ON_ERROR_STOP=1 -f -
 if($LASTEXITCODE -ne 0){throw 'Runtime role provisioning failed'}
 $env:PGPASSWORD=$password
 $check=& $psql -h 127.0.0.1 -p 55432 -U uat_oauth_runtime -d patrickos_uat -w -tAc 'SELECT current_user'
 if("$check".Trim() -ne 'uat_oauth_runtime'){throw 'Runtime DB login validation failed'}
 $secure=ConvertTo-SecureString $password -AsPlainText -Force
 [IO.File]::WriteAllText($runtimeFile,(ConvertFrom-SecureString $secure),[Text.Encoding]::ASCII)
 $secure.Dispose()
 Write-Output 'RESTRICTED_OAUTH_DB_ROLE_VERIFIED'
 Write-Output 'RUNTIME_PASSWORD_DPAPI_ENROLLED'
}finally{
 [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($adminPtr)
 Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
 $adminSecure.Dispose()
 $admin=$null;$password=$null;$rand=$null
}