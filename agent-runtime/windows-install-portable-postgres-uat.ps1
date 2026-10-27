# Local-only UAT PostgreSQL bootstrap from vendor-hash-verified ZIP.
# The generated database password is never printed or sent to ChatGPT.
$ErrorActionPreference='Stop'
$base=Join-Path $env:LOCALAPPDATA 'PatrickOS\UAT'
$zip=Join-Path $base 'downloads\postgresql-17.11-5-windows-x64-binaries.zip'
$binroot=Join-Path $base 'postgres-portable'
$data=Join-Path $base 'pgdata'
$cfg=Join-Path $base 'postgres-uat.config.dpapi'
$expected='80379b2c04d51c30225532e0ae04509899141e9957ed096fe749d7fd9df8f82f'
if(!(Test-Path $zip)){throw 'Verified archive missing'}
if((Get-FileHash $zip -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected){throw 'Postgres SHA256 mismatch'}
Write-Output 'POSTGRES_VENDOR_SHA256_VERIFIED'
if(!(Test-Path $binroot)){New-Item -ItemType Directory $binroot -Force|Out-Null;Expand-Archive -LiteralPath $zip -DestinationPath $binroot -Force}
$initdb=Get-ChildItem $binroot -Recurse -Filter initdb.exe -File | Select-Object -First 1 -ExpandProperty FullName
if(!$initdb){throw 'Missing initdb executable'}
$bin=Split-Path -Parent $initdb
$pgctl=Join-Path $bin 'pg_ctl.exe'
$psql=Join-Path $bin 'psql.exe'
if((Test-Path $data) -or (Test-Path $cfg)){throw 'Existing UAT database or config; refusing overwrite'}
$bytes=New-Object byte[] 48
$rng=[System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes);$rng.Dispose()
$password=[Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+','-').Replace('/','_')
$pwfile=Join-Path $base ('pg-password-'+[guid]::NewGuid().ToString('N')+'.tmp')
try{
 [System.IO.File]::WriteAllText($pwfile,$password,[System.Text.Encoding]::ASCII)
 & $initdb -D $data -U uat_admin -A scram-sha-256 --pwfile=$pwfile --encoding=UTF8 --no-instructions | Out-Null
 if($LASTEXITCODE -ne 0){throw 'initdb failed'}
 Add-Content -LiteralPath (Join-Path $data 'postgresql.conf') -Value @('listen_addresses = ''127.0.0.1''','port = 55432')
 $json=(@{host='127.0.0.1';port=55432;database='patrickos_uat';user='uat_admin';password=$password}|ConvertTo-Json -Compress)
 $secure=ConvertTo-SecureString -String $json -AsPlainText -Force
 [System.IO.File]::WriteAllText($cfg,(ConvertFrom-SecureString $secure),[System.Text.Encoding]::ASCII)
 $secure.Dispose()
 & $pgctl -D $data -l (Join-Path $base 'postgres-uat.log') -o '-h 127.0.0.1 -p 55432' -w start | Out-Null
 if($LASTEXITCODE -ne 0){throw 'Local postgres start failed'}
 $env:PGPASSWORD=$password
 try{
  & $psql -h 127.0.0.1 -p 55432 -U uat_admin -d postgres -w -v ON_ERROR_STOP=1 -c 'CREATE DATABASE patrickos_uat;' | Out-Null
  if($LASTEXITCODE -ne 0){throw 'Database create failed'}
  $result=(& $psql -h 127.0.0.1 -p 55432 -U uat_admin -d patrickos_uat -w -tAc 'SELECT current_database()')
  if($result.Trim() -ne 'patrickos_uat'){throw 'Database verification failed'}
  Write-Output 'POSTGRES_UAT_DATABASE_CONNECTED'
 } finally {Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue}
 Write-Output 'POSTGRES_UAT_LOCAL_ONLY_INSTALLED'
}finally{
 Remove-Item -LiteralPath $pwfile -Force -ErrorAction SilentlyContinue
 $password=$null;$json=$null;$bytes=$null
}