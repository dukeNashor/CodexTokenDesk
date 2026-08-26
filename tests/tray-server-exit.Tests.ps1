param(
    [string]$Executable = (Join-Path (Split-Path $PSScriptRoot -Parent) "dist\CodexTokenDesk\CodexTokenDesk.exe")
)

$ErrorActionPreference = "Stop"
$dashboardUri = "http://127.0.0.1:3002/api/health"
$logFile = Join-Path $env:LOCALAPPDATA "CodexTokenDesk\logs\lifecycle.log"
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
            $health = Invoke-RestMethod -Uri ($dashboardUri + "?test=" + [Guid]::NewGuid().ToString("N")) -TimeoutSec 2
            if (-not [string]::IsNullOrWhiteSpace([string]$health.instanceId)) { return }
        }
        catch {
            # Startup is still in progress.
        }
        Start-Sleep -Milliseconds 150
    } while ([DateTime]::UtcNow -lt $deadline)
    throw "The dashboard did not become healthy."
}

function Wait-ForUnexpectedExitLog([DateTime]$startedAtUtc) {
    $deadline = [DateTime]::UtcNow.AddSeconds(10)
    do {
        if (Test-Path -LiteralPath $logFile) {
            foreach ($line in Get-Content -LiteralPath $logFile -Tail 30) {
                $parts = $line -split "`t", 3
                $timestamp = [DateTime]::MinValue
                if ($parts.Count -eq 3 -and [DateTime]::TryParse($parts[0], [ref]$timestamp) -and
                    $timestamp.ToUniversalTime() -ge $startedAtUtc -and $parts[1] -eq "service.unexpected-exit") {
                    return
                }
            }
        }
        Start-Sleep -Milliseconds 100
    } while ([DateTime]::UtcNow -lt $deadline)
    throw "The tray did not report the unexpected server exit."
}

if ((Get-ListenerPid) -ne 0) { throw "Port 3002 must be free before the server-exit test starts." }

try {
    $trayProcess = Start-Process -FilePath $Executable -ArgumentList "--start" -WindowStyle Hidden -PassThru
    Wait-ForHealth
    $listenerPid = Get-ListenerPid
    if ($listenerPid -le 0) { throw "The healthy dashboard had no listener." }

    $killedAtUtc = [DateTime]::UtcNow
    Stop-Process -Id $listenerPid -Force
    Wait-ForUnexpectedExitLog $killedAtUtc

    if ($trayProcess.HasExited) { throw "The server exit also terminated the tray." }
    $noRestartDeadline = [DateTime]::UtcNow.AddSeconds(5)
    do {
        if ((Get-ListenerPid) -ne 0) { throw "The tray automatically restarted the failed server." }
        Start-Sleep -Milliseconds 100
    } while ([DateTime]::UtcNow -lt $noRestartDeadline)

    Write-Host "PASS: an unexpected server exit faults the persistent tray without a restart loop."
}
finally {
    if ($trayProcess -and -not $trayProcess.HasExited) {
        $exitCommand = Start-Process -FilePath $Executable -ArgumentList "--exit" -PassThru
        $exitCommand.WaitForExit(5000) | Out-Null
        if (-not $trayProcess.WaitForExit(10000)) { Stop-Process -Id $trayProcess.Id -Force -ErrorAction SilentlyContinue }
    }
    $listenerPid = Get-ListenerPid
    if ($listenerPid -ne 0) { Stop-Process -Id $listenerPid -Force -ErrorAction SilentlyContinue }
}
