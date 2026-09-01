param(
    [string]$Package = (Join-Path (Split-Path $PSScriptRoot -Parent) "dist\CodexTokenDesk-standalone-win-x64.zip")
)

$ErrorActionPreference = "Stop"
$dashboardUri = "http://127.0.0.1:3002/api/health"
$stateFile = Join-Path $env:LOCALAPPDATA "CodexTokenDesk\server.json"
$extractDirectory = Join-Path $env:TEMP ("codex-token-desk-standalone-test-" + [guid]::NewGuid().ToString("N"))
$trayProcess = $null

function Get-ListenerPid {
    $connection = Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 3002 -State Listen -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($connection) { return [int]$connection.OwningProcess }
    return 0
}

function Wait-ForHealth {
    $deadline = [DateTime]::UtcNow.AddSeconds(25)
    do {
        try {
            $response = Invoke-RestMethod -Uri ($dashboardUri + "?test=" + [guid]::NewGuid().ToString("N")) -TimeoutSec 2
            if ($response.ok -eq $true -and $response.service -eq "Codex Token Desk") { return $response }
        }
        catch {
            # Startup is still in progress.
        }
        Start-Sleep -Milliseconds 250
    } while ([DateTime]::UtcNow -lt $deadline)
    throw "Standalone package did not become healthy within 25 seconds."
}

if (-not (Test-Path -LiteralPath $Package)) { throw "Standalone package was not found: $Package" }
if ((Get-ListenerPid) -ne 0) { throw "Port 3002 must be free before the standalone test starts." }
Expand-Archive -LiteralPath $Package -DestinationPath $extractDirectory
$executable = Join-Path $extractDirectory "CodexTokenDesk.exe"
if (Test-Path -LiteralPath (Join-Path $extractDirectory "package.json")) { throw "Standalone package contains source package.json." }
if (Test-Path -LiteralPath (Join-Path $extractDirectory "node_modules")) { throw "Standalone package contains a top-level node_modules directory." }

try {
    $trayProcess = Start-Process -FilePath $executable -PassThru -WindowStyle Hidden
    $health = Wait-ForHealth
    $state = Get-Content -Raw -LiteralPath $stateFile | ConvertFrom-Json
    $launcher = Get-CimInstance Win32_Process -Filter "ProcessId = $($state.launcherProcessId)"
    if ($launcher.Name -ne "node.exe") { throw "Standalone package launcher was not node.exe: $($launcher.Name)" }
    if ($launcher.CommandLine -notmatch "standalone[\\/]server\.js") { throw "Standalone package launcher did not run standalone/server.js." }
    if (-not (Test-Path -LiteralPath (Join-Path $extractDirectory "runtime\node\node.exe"))) { throw "Bundled node.exe was not found." }

    & $executable --exit
    $deadline = [DateTime]::UtcNow.AddSeconds(10)
    do {
        if ((Get-ListenerPid) -eq 0) { break }
        Start-Sleep -Milliseconds 200
    } while ([DateTime]::UtcNow -lt $deadline)
    if ((Get-ListenerPid) -ne 0) { throw "Standalone package did not release port 3002." }
    Write-Host "PASS: standalone package runs from a clean directory without source dependencies."
}
finally {
    if ($trayProcess -and -not $trayProcess.HasExited) {
        Stop-Process -Id $trayProcess.Id -Force -ErrorAction SilentlyContinue
    }
    if ((Get-ListenerPid) -ne 0) {
        & $executable --exit
    }
}
