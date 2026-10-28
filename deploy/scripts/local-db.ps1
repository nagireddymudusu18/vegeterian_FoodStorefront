<#
  Docker-free local Postgres for development (portable PostgreSQL 16 + PostGIS, no admin rights needed).
  Usage:  powershell -File deploy/scripts/local-db.ps1 <init|start|stop|status>
  Env:    PGHOME (default %USERPROFILE%\tools\pgsql), PGDATA_DIR (default %USERPROFILE%\tools\pgdata), PGPORT (default 5432)
  Each service gets its own database and user, named after the service, with the password equal to the user name
  (the same defaults as application.yml). Local development only: the server listens on 127.0.0.1.
#>
param([Parameter(Position = 0)][ValidateSet('init', 'start', 'stop', 'status')][string]$Action = 'status')

$ErrorActionPreference = 'Stop'
$pgHome = if ($env:PGHOME) { $env:PGHOME } else { Join-Path $env:USERPROFILE 'tools\pgsql' }
$data = if ($env:PGDATA_DIR) { $env:PGDATA_DIR } else { Join-Path $env:USERPROFILE 'tools\pgdata' }
$port = if ($env:PGPORT) { $env:PGPORT } else { '5432' }
$bin = Join-Path $pgHome 'bin'
$databases = 'identity', 'catalog', 'order', 'payment', 'fleet'

function Psql([string]$db, [string]$sql) {
    & "$bin\psql.exe" -h 127.0.0.1 -p $port -U postgres -d $db -v ON_ERROR_STOP=1 -q -t -A -c $sql
    if ($LASTEXITCODE -ne 0) { throw "psql failed: $sql" }
}

function Start-Server {
    # Start-Process with file redirection: the postgres child must not inherit this console's output pipe
    $log = Join-Path $data 'pg_ctl.out'
    Start-Process -FilePath "$bin\pg_ctl.exe" -Wait -NoNewWindow -RedirectStandardOutput $log `
        -RedirectStandardError "$log.err" `
        -ArgumentList @('-D', "`"$data`"", '-l', "`"$(Join-Path $data 'server.log')`"", '-o', "`"-p $port -c listen_addresses=127.0.0.1`"", '-w', 'start')
}

switch ($Action) {
    'init' {
        if (-not (Test-Path (Join-Path $data 'PG_VERSION'))) {
            & "$bin\initdb.exe" -D $data -U postgres -A trust -E UTF8 --locale=C
            if ($LASTEXITCODE -ne 0) { throw 'initdb failed' }
        }
        & "$bin\pg_ctl.exe" -D $data status | Out-Null
        if ($LASTEXITCODE -ne 0) { Start-Server }
        foreach ($name in $databases) {
            if (-not (Psql 'postgres' "SELECT 1 FROM pg_roles WHERE rolname='$name'")) {
                Psql 'postgres' "CREATE ROLE \""$name\"" LOGIN PASSWORD '$name'"
            }
            if (-not (Psql 'postgres' "SELECT 1 FROM pg_database WHERE datname='$name'")) {
                Psql 'postgres' "CREATE DATABASE \""$name\"" OWNER \""$name\"""
            }
        }
        # catalog's first migration runs CREATE EXTENSION postgis, which a non-superuser cannot do
        Psql 'catalog' 'CREATE EXTENSION IF NOT EXISTS postgis'
        Write-Host "Databases ready on 127.0.0.1:$port : $($databases -join ', ')"
    }
    'start' { Start-Server }
    'stop' { & "$bin\pg_ctl.exe" -D $data -m fast stop }
    'status' { & "$bin\pg_ctl.exe" -D $data status }
}
