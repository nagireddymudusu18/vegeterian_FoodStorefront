<#
  Docker-free local stack: the four services, the dev gateway and the storefront (dev server).
  Usage:  powershell -File deploy/scripts/local-run.ps1 <build|up|down|status>
  Needs:  local Postgres (deploy/scripts/local-db.ps1 init), JDK 21 + Maven (JAVA_HOME / PATH), Node.
  Secrets come from deploy/compose/.env (created by gen-keys.mjs); database passwords are the local defaults.
  Logs and pid files: deploy/local/ (not committed).
#>
param([Parameter(Position = 0)][ValidateSet('build', 'up', 'down', 'status')][string]$Action = 'status')

$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$work = Join-Path $root 'deploy\local'
New-Item -ItemType Directory -Force $work | Out-Null

$services = @(
    @{ Name = 'identity'; Port = 8081 }, @{ Name = 'catalog'; Port = 8082 },
    @{ Name = 'order'; Port = 8083 }, @{ Name = 'payment'; Port = 8084 }, @{ Name = 'fleet'; Port = 8085 })

function Read-Env {
    $file = Join-Path $root 'deploy\compose\.env'
    if (-not (Test-Path $file)) { node (Join-Path $root 'deploy\scripts\gen-keys.mjs') | Out-Null }
    $map = @{}
    foreach ($line in Get-Content $file) {
        if ($line -match '^\s*([A-Z0-9_]+)=(.*)$') { $map[$Matches[1]] = $Matches[2].Trim('"') }
    }
    if (-not $map.FLEET_FEED_KEY) {
        # .env predates fleet-service: add its feed key once
        $key = node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
        Add-Content $file "FLEET_FEED_KEY=$key"
        $map.FLEET_FEED_KEY = $key
    }
    $map
}

function Jar([string]$name) {
    Get-ChildItem (Join-Path $root "services\$name-service\target") -Filter '*.jar' -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -notmatch 'original|plain' } | Select-Object -First 1
}

function Start-Bg([string]$name, [string]$file, [string[]]$argList, [hashtable]$vars, [string]$dir) {
    foreach ($k in $vars.Keys) { Set-Item -Path "Env:$k" -Value $vars[$k] }
    try {
        $p = Start-Process -FilePath $file -ArgumentList $argList -WorkingDirectory $dir -WindowStyle Hidden -PassThru `
            -RedirectStandardOutput (Join-Path $work "$name.log") -RedirectStandardError (Join-Path $work "$name.err.log")
    } finally {
        # keep one service's secrets (e.g. the JWT private key) out of the next service's environment
        foreach ($k in $vars.Keys) { Remove-Item -Path "Env:$k" -ErrorAction SilentlyContinue }
    }
    Set-Content (Join-Path $work "$name.pid") $p.Id
}

switch ($Action) {
    'build' {
        foreach ($s in $services) {
            mvn -B -q -f (Join-Path $root "services\$($s.Name)-service\pom.xml") -DskipTests clean package
            if ($LASTEXITCODE -ne 0) { throw "build failed: $($s.Name)" }
        }
        $sf = Join-Path $root 'storefront'
        if (-not (Test-Path (Join-Path $sf 'node_modules'))) {
            Push-Location $sf
            try { npm install } finally { Pop-Location }
        }
    }
    'up' {
        $e = Read-Env
        $extra = @{
            identity = @{ JWT_PRIVATE_KEY_PEM = $e.JWT_PRIVATE_KEY_PEM; PII_ENC_KEY = $e.PII_ENC_KEY; PII_HMAC_KEY = $e.PII_HMAC_KEY
                INTERNAL_FEED_KEY = $e.IDENTITY_FEED_KEY; SMS_PROVIDER = 'logging'; EMAIL_PROVIDER = 'logging'; APP_BASE_URL = 'http://localhost:8080'; APP_MAIN_ADMIN_EMAIL = 'admin@foodapp.local' }
            catalog  = @{ INTERNAL_FEED_KEY = $e.CATALOG_FEED_KEY; SEED_DEMO_DATA = 'true' }
            order    = @{ INTERNAL_FEED_KEY = $e.ORDER_FEED_KEY; CATALOG_FEED_URL = 'http://localhost:8082'
                CATALOG_FEED_KEY = $e.CATALOG_FEED_KEY; PAYMENT_FEED_URL = 'http://localhost:8084'
                PAYMENT_FEED_KEY = $e.PAYMENT_FEED_KEY; FLEET_FEED_URL = 'http://localhost:8085'
                FLEET_FEED_KEY = $e.FLEET_FEED_KEY; FEED_POLL_MS = '2000' }
            payment  = @{ INTERNAL_FEED_KEY = $e.PAYMENT_FEED_KEY; GATEWAY = 'fake'; ALLOW_FAKE_GATEWAY = 'true' }
            fleet    = @{ INTERNAL_FEED_KEY = $e.FLEET_FEED_KEY; ORDER_FEED_URL = 'http://localhost:8083'
                ORDER_FEED_KEY = $e.ORDER_FEED_KEY; FEED_POLL_MS = '2000' }
        }
        foreach ($s in $services) {
            $jar = Jar $s.Name
            if (-not $jar) { throw "No jar for $($s.Name); run: local-run.ps1 build" }
            $vars = @{ SERVER_PORT = "$($s.Port)"; DB_USER = $s.Name; DB_PASSWORD = $s.Name
                DB_URL = "jdbc:postgresql://localhost:5432/$($s.Name)"; JWT_PUBLIC_KEY_PEM = $e.JWT_PUBLIC_KEY_PEM }
            foreach ($k in $extra[$s.Name].Keys) { $vars[$k] = $extra[$s.Name][$k] }
            Start-Bg "$($s.Name)-service" 'java' @('-Xmx384m', '-jar', "`"$($jar.FullName)`"") $vars $root
            Write-Host "started $($s.Name)-service on :$($s.Port)"
        }
        Start-Bg 'gateway' 'node' @("`"$(Join-Path $root 'deploy\scripts\dev-gateway.mjs')`"") @{} $root
        Start-Bg 'storefront' 'cmd.exe' @('/c', 'npm', 'run', 'dev') @{ NEXT_PUBLIC_API_BASE = 'http://localhost:8080' } (Join-Path $root 'storefront')
        Write-Host 'Open http://localhost:8080 once the services have started (about 30-60 s). Logs: deploy/local/'
    }
    'down' {
        Get-ChildItem $work -Filter '*.pid' -ErrorAction SilentlyContinue | ForEach-Object {
            $id = [int](Get-Content $_.FullName)
            taskkill /PID $id /T /F 2>$null | Out-Null
            Remove-Item $_.FullName
            Write-Host "stopped $($_.BaseName)"
        }
    }
    'status' {
        Get-ChildItem $work -Filter '*.pid' -ErrorAction SilentlyContinue | ForEach-Object {
            $alive = [bool](Get-Process -Id ([int](Get-Content $_.FullName)) -ErrorAction SilentlyContinue)
            '{0,-20} {1}' -f $_.BaseName, $(if ($alive) { 'running' } else { 'stopped' })
        }
    }
}

