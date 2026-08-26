param(
    [string]$Executable = (Join-Path (Split-Path $PSScriptRoot -Parent) "dist\CodexTokenDesk\CodexTokenDesk.exe")
)

$ErrorActionPreference = "Stop"
$dashboardUri = "http://127.0.0.1:3002/api/health"
$stateFile = Join-Path $env:LOCALAPPDATA "CodexTokenDesk\server.json"
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
            $response = Invoke-RestMethod -Uri ($dashboardUri + "?test=" + [Guid]::NewGuid().ToString("N")) -TimeoutSec 2
            if ($response.ok -eq $true -and $response.service -eq "Codex Token Desk") { return $response }
        }
        catch {
            # Startup is still in progress.
        }
        Start-Sleep -Milliseconds 250
    } while ([DateTime]::UtcNow -lt $deadline)
    throw "Codex Token Desk did not become healthy within 25 seconds."
}

function Wait-ForShutdown {
    $deadline = [DateTime]::UtcNow.AddSeconds(10)
    do {
        if ((Get-ListenerPid) -eq 0) { return }
        Start-Sleep -Milliseconds 100
    } while ([DateTime]::UtcNow -lt $deadline)
    throw "Codex Token Desk did not release port 3002 within ten seconds."
}

function Wait-ForFinalizedState([string]$expectedInstanceId, [int]$expectedListenerPid) {
    $deadline = [DateTime]::UtcNow.AddSeconds(3)
    do {
        if (Test-Path -LiteralPath $stateFile) {
            try {
                $state = Get-Content -Raw -LiteralPath $stateFile | ConvertFrom-Json
                if ($state.instanceId -eq $expectedInstanceId -and [int]$state.listenerProcessId -eq $expectedListenerPid) {
                    return $state
                }
            }
            catch {
                # The atomic replacement may be between observable states.
            }
        }
        Start-Sleep -Milliseconds 50
    } while ([DateTime]::UtcNow -lt $deadline)
    throw "server.json did not identify the healthy listener within three seconds."
}

if ((Get-ListenerPid) -ne 0) { throw "Port 3002 must be free before the identity test starts." }

try {
    $trayProcess = Start-Process -FilePath $Executable -PassThru -WindowStyle Hidden
    $health = Wait-ForHealth
    if ([string]::IsNullOrWhiteSpace([string]$health.instanceId)) {
        throw "The health response did not expose a per-launch instanceId."
    }
    if (-not (Test-Path -LiteralPath $stateFile)) {
        throw "The running tray did not create $stateFile."
    }

    $listenerPid = Get-ListenerPid
    $state = Wait-ForFinalizedState $health.instanceId $listenerPid
    if ($state.instanceId -ne $health.instanceId) { throw "The state file and health response instanceId values did not match." }
    if ([int]$state.port -ne 3002) { throw "The state file did not identify port 3002." }
    if ([int]$state.listenerProcessId -ne $listenerPid) { throw "The state file did not identify the listening process." }

    & $Executable --exit
    Wait-ForShutdown
    if (Test-Path -LiteralPath $stateFile) { throw "A normal tray exit left server.json behind." }

    Write-Host "PASS: health and server.json identify the owned server instance and normal exit cleans it up."
}
finally {
    if ($trayProcess -and -not $trayProcess.HasExited) {
        Stop-Process -Id $trayProcess.Id -Force -ErrorAction SilentlyContinue
    }
    $listener = Get-ListenerPid
    if ($listener -ne 0) {
        Stop-Process -Id $listener -Force -ErrorAction SilentlyContinue
    }
}
