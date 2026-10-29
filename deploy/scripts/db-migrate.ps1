<#
  Copies the local Postgres databases (identity, catalog, order, payment, fleet) to the VM prepared by
  deploy/oracle/setup-postgres.sh, then compares exact row counts table by table.
  Usage:  powershell -File deploy/scripts/db-migrate.ps1 -Server ubuntu@<vm-ip> -KeyFile C:\path\key.pem
  Needs the local Postgres running (local-db.ps1 start) and the local stack stopped (local-run.ps1 down).
  The remote databases must be empty (freshly created by setup-postgres.sh); the script refuses otherwise.
  Nothing is dropped or overwritten, and the local databases are only read.
#>
param(
    [Parameter(Mandatory)][string]$Server,
    [Parameter(Mandatory)][string]$KeyFile,
    [string[]]$Databases = @('identity', 'catalog', 'order', 'payment', 'fleet')
)
$ErrorActionPreference = 'Stop'
$pgHome = if ($env:PGHOME) { $env:PGHOME } else { Join-Path $env:USERPROFILE 'tools\pgsql' }
$bin = Join-Path $pgHome 'bin'
$sshOpts = @('-i', $KeyFile, '-o', 'StrictHostKeyChecking=accept-new')

# Exact row count per table, as "schema.table=n" lines
$countSql = "SELECT table_schema||'.'||table_name||'='||(xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text FROM information_schema.tables WHERE table_type='BASE TABLE' AND table_schema NOT IN ('pg_catalog','information_schema','tiger','tiger_data','topology') AND table_name <> 'spatial_ref_sys' ORDER BY 1"

function Remote([string]$cmd) {
    $out = & ssh @sshOpts $Server $cmd
    if ($LASTEXITCODE -ne 0) { throw "remote command failed: $cmd" }
    $out
}

$tmp = Join-Path $env:TEMP 'veggo-dumps'
New-Item -ItemType Directory -Force $tmp | Out-Null
$failed = @()
try {
    foreach ($db in $Databases) {
        Write-Host "== $db"
        $existing = Remote "sudo -u postgres psql -d $db -tAc `"select count(*) from information_schema.tables where table_schema='public'`""
        if ([int]($existing | Select-Object -First 1) -ne 0) { throw "remote database '$db' is not empty; refusing to restore into it" }

        $file = Join-Path $tmp "$db.dump"
        & "$bin\pg_dump.exe" -h 127.0.0.1 -U postgres -Fc --no-acl -f $file $db
        if ($LASTEXITCODE -ne 0) { throw "pg_dump failed for $db" }

        & scp @sshOpts $file "${Server}:/tmp/$db.dump"
        if ($LASTEXITCODE -ne 0) { throw "scp failed for $db" }
        Remote "sudo cp /tmp/$db.dump /var/tmp/$db.dump && sudo chmod 644 /var/tmp/$db.dump && rm /tmp/$db.dump" | Out-Null
        Remote "sudo -u postgres pg_restore --no-acl --exit-on-error -d $db /var/tmp/$db.dump" | Out-Null
        Remote "sudo shred -u /var/tmp/$db.dump" | Out-Null

        $local = & "$bin\psql.exe" -h 127.0.0.1 -U postgres -d $db -tA -c $countSql
        $remote = Remote "sudo -u postgres psql -d $db -tA -c `"$($countSql -replace '"','\"')`""
        $diff = Compare-Object @($local) @($remote)
        if ($diff) { $failed += $db; Write-Host "  MISMATCH:"; $diff | Format-Table | Out-String | Write-Host }
        else { Write-Host "  OK: $(@($local).Count) tables, row counts identical" }
    }
}
finally { Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue }

if ($failed) { throw "Row counts differ for: $($failed -join ', ')" }
Write-Host 'MIGRATION VERIFIED'
