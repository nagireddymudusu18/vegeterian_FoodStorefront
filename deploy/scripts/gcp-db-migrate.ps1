<#
  Copies the local Postgres databases to the Cloud SQL sandbox instance and verifies exact row counts.
  Usage:  powershell -File deploy/scripts/gcp-db-migrate.ps1
  Needs:  gcloud signed in, deploy/local/gcp.env (GCP_PROJECT, SQL_INSTANCE, PW_<SERVICE>), the local Postgres running.
  Only HTTPS is used (Cloud Storage REST via .NET, so the Windows trust store applies) and the target databases must be empty.
  A temporary private bucket carries the dumps and is deleted at the end, together with the local dump files.
#>
$ErrorActionPreference = 'Stop'
$root = Split-Path (Split-Path $PSScriptRoot)
$services = 'identity', 'catalog', 'order', 'payment', 'fleet'
$bin = Join-Path $(if ($env:PGHOME) { $env:PGHOME } else { Join-Path $env:USERPROFILE 'tools\pgsql' }) 'bin'

$cfg = @{}
Get-Content (Join-Path $root 'deploy\local\gcp.env') | ForEach-Object { if ($_ -match '^(\w+)=(.*)$') { $cfg[$Matches[1]] = $Matches[2] } }
$project = $cfg['GCP_PROJECT']; $instance = $cfg['SQL_INSTANCE']
$bucket = "$project-migrate-$(Get-Random -Minimum 1000 -Maximum 9999)"
$dumps = Join-Path $root 'deploy\local\dumps'
$gcloud = Join-Path $env:USERPROFILE 'tools\google-cloud-sdk\bin'
if (Test-Path $gcloud) { $env:Path = "$gcloud;$env:Path" }
if (-not $env:CLOUDSDK_PYTHON -and (Get-Command python -ErrorAction SilentlyContinue)) { $env:CLOUDSDK_PYTHON = (Get-Command python).Source }
$env:CLOUDSDK_CORE_DISABLE_PROMPTS = 1

function Gc { $o = & gcloud @args 2>&1; if ($LASTEXITCODE -ne 0) { throw "gcloud $($args -join ' ') failed:`n$o" }; $o }
function Token { @{ Authorization = "Bearer $((& gcloud auth print-access-token 2>$null).Trim())" } }
function Api([string]$method, [string]$path, $body, [string]$file) {
    $p = @{ Method = $method; Uri = "https://storage.googleapis.com$path"; Headers = (Token) }
    if ($body) { $p.ContentType = 'application/json'; $p.Body = ($body | ConvertTo-Json -Depth 6) }
    if ($file) { $p.ContentType = 'application/sql'; $p.InFile = $file }
    Invoke-RestMethod @p
}
function Grant([string]$role) {
    $pol = Api Get "/storage/v1/b/$bucket/iam"
    $pol.bindings = @($pol.bindings | Where-Object { $_.role -ne 'roles/storage.objectUser' }) + [pscustomobject]@{ role = $role; members = @("serviceAccount:$sa") }
    [void](Api Put "/storage/v1/b/$bucket/iam" $pol)
}

$countSql = "SELECT table_schema||'.'||table_name||'='||(xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text FROM information_schema.tables WHERE table_type='BASE TABLE' AND table_schema NOT IN ('pg_catalog','information_schema','tiger','tiger_data','topology') AND table_name <> 'spatial_ref_sys' ORDER BY 1"

$sa = (Gc sql instances describe $instance --format='value(serviceAccountEmailAddress)' | Out-String).Trim()
New-Item -ItemType Directory -Force $dumps | Out-Null
$failed = @()
try {
    foreach ($s in $services) {
        $f = Join-Path $dumps "$s.sql"
        & "$bin\pg_dump.exe" -h 127.0.0.1 -U postgres --no-owner --no-acl --no-comments --exclude-table-data=spatial_ref_sys -f $f $s
        if ($LASTEXITCODE -ne 0) { throw "pg_dump failed for $s" }
        # postgis is created separately by the admin user, not by the service user
        $lines = [IO.File]::ReadAllLines($f) | Where-Object { $_ -notmatch '^CREATE EXTENSION' -and $_ -notmatch '^COMMENT ON EXTENSION' }
        [IO.File]::WriteAllLines($f, $lines, (New-Object Text.UTF8Encoding $false))
        $prep = "GRANT ""$s"" TO postgres;`nALTER DATABASE ""$s"" OWNER TO ""$s"";`n" + $(if ($s -eq 'catalog') { "CREATE EXTENSION IF NOT EXISTS postgis;`n" } else { '' })
        [IO.File]::WriteAllText((Join-Path $dumps "prep-$s.sql"), $prep, (New-Object Text.UTF8Encoding $false))
    }

    Write-Host "Creating private bucket $bucket"
    [void](Api Post "/storage/v1/b?project=$project" @{ name = $bucket; location = 'ASIA-SOUTH1'; iamConfiguration = @{ uniformBucketLevelAccess = @{ enabled = $true }; publicAccessPrevention = 'enforced' } })
    Grant 'roles/storage.objectUser'
    Start-Sleep 20
    foreach ($f in Get-ChildItem $dumps -Filter *.sql) { [void](Api Post "/upload/storage/v1/b/$bucket/o?uploadType=media&name=$($f.Name)" $null $f.FullName) }

    foreach ($s in $services) {
        Write-Host "== $s"
        [void](Gc sql import sql $instance "gs://$bucket/prep-$s.sql" --database=$s --user=postgres --quiet)
        [void](Gc sql import sql $instance "gs://$bucket/$s.sql" --database=$s --user=$s --quiet)
        [void](Gc sql export csv $instance "gs://$bucket/counts-$s.csv" --database=$s "--query=$countSql" --quiet)
        $remote = (Api Get "/storage/v1/b/$bucket/o/counts-$s.csv?alt=media") -split "`r?`n" | ForEach-Object { $_.Trim('"') } | Where-Object { $_ }
        $local = & "$bin\psql.exe" -h 127.0.0.1 -U postgres -d $s -tA -c $countSql
        if (Compare-Object @($local) @($remote)) { $failed += $s; Write-Host '  MISMATCH' } else { Write-Host "  OK: $(@($local).Count) tables, row counts identical" }
    }
}
finally {
    try {
        $items = (Api Get "/storage/v1/b/$bucket/o").items
        foreach ($i in $items) { [void](Api Delete "/storage/v1/b/$bucket/o/$([uri]::EscapeDataString($i.name))") }
        [void](Api Delete "/storage/v1/b/$bucket")
    } catch { Write-Warning "Delete bucket $bucket manually: $($_.Exception.Message)" }
    Remove-Item -Recurse -Force $dumps -ErrorAction SilentlyContinue
}
if ($failed) { throw "Row counts differ for: $($failed -join ', ')" }
Write-Host 'MIGRATION VERIFIED'
