param(
    [string]$Executable = (Join-Path (Split-Path $PSScriptRoot -Parent) "dist\CodexTokenDesk\CodexTokenDesk.exe")
)

$ErrorActionPreference = "Stop"
$dashboardUri = "http://127.0.0.1:3002/api/health"
$trayProcess = $null

function Get-ListenerPid {
    $connection = Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 3002 -State Listen -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($connection) { return [int]$connection.OwningProcess }
    return 0
}

function Wait-ForHealth([string]$differentFrom = "") {
    $deadline = [DateTime]::UtcNow.AddSeconds(25)
    do {
        try {
            $health = Invoke-RestMethod -Uri ($dashboardUri + "?test=" + [Guid]::NewGuid().ToString("N")) -TimeoutSec 2
            if (-not [string]::IsNullOrWhiteSpace([string]$health.instanceId) -and $health.instanceId -ne $differentFrom) { return $health }
        }
        catch {
            # The requested command is still being processed.
        }
        Start-Sleep -Milliseconds 150
    } while ([DateTime]::UtcNow -lt $deadline)
    throw "The dashboard did not reach the expected healthy instance within 25 seconds."
}

function Wait-ForPortRelease {
    $deadline = [DateTime]::UtcNow.AddSeconds(10)
    do {
        if ((Get-ListenerPid) -eq 0) { return }
        Start-Sleep -Milliseconds 100
    } while ([DateTime]::UtcNow -lt $deadline)
    throw "Port 3002 remained occupied after a tray command."
}

function Invoke-TrayCommand([string]$command) {
    $commandProcess = Start-Process -FilePath $Executable -ArgumentList $command -PassThru
    if (-not $commandProcess.WaitForExit(5000)) {
        Stop-Process -Id $commandProcess.Id -Force -ErrorAction SilentlyContinue
        throw "$command did not return within five seconds."
    }
    if ($commandProcess.ExitCode -ne 0) { throw "$command returned exit code $($commandProcess.ExitCode)." }
}

if ((Get-ListenerPid) -ne 0) { throw "Port 3002 must be free before the command test starts." }

try {
    $trayProcess = Start-Process -FilePath $Executable -ArgumentList "--start" -WindowStyle Hidden -PassThru
    $firstHealth = Wait-ForHealth
    if ($trayProcess.HasExited) { throw "--start returned without leaving a persistent tray owner." }

    Invoke-TrayCommand "--stop"
    Wait-ForPortRelease
    if ($trayProcess.HasExited) { throw "--stop exited the persistent tray." }

    Invoke-TrayCommand "--start"
    $secondHealth = Wait-ForHealth $firstHealth.instanceId
    if ($trayProcess.HasExited) { throw "--start replaced the persistent tray process." }

    Invoke-TrayCommand "--restart"
    $thirdHealth = Wait-ForHealth $secondHealth.instanceId
    if ($thirdHealth.instanceId -eq $secondHealth.instanceId) { throw "--restart did not create a new server instance." }

    Invoke-TrayCommand "--exit"
    if (-not $trayProcess.WaitForExit(10000)) { throw "--exit did not close the persistent tray." }
    Wait-ForPortRelease

    Write-Host "PASS: all lifecycle commands were executed by one persistent tray owner."
}
finally {
    if ($trayProcess -and -not $trayProcess.HasExited) {
        Stop-Process -Id $trayProcess.Id -Force -ErrorAction SilentlyContinue
    }
    $listenerPid = Get-ListenerPid
    if ($listenerPid -ne 0) { Stop-Process -Id $listenerPid -Force -ErrorAction SilentlyContinue }
}
