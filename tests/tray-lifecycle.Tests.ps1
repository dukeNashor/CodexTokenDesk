param(
    [string]$Executable = (Join-Path (Split-Path $PSScriptRoot -Parent) "dist\CodexTokenDesk\CodexTokenDesk.exe")
)

$ErrorActionPreference = "Stop"
$dashboardUri = "http://127.0.0.1:3002/api/health"
$stateFile = Join-Path $env:LOCALAPPDATA "CodexTokenDesk\server.json"
$trayProcess = $null
$listenerPid = 0

function Get-ListenerPid {
    $connection = Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 3002 -State Listen -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($connection) { return [int]$connection.OwningProcess }
    return 0
}

function Wait-ForDashboard {
    $deadline = [DateTime]::UtcNow.AddSeconds(25)
    do {
        try {
            $response = Invoke-RestMethod -Uri ($dashboardUri + "?test=" + [Guid]::NewGuid().ToString("N")) -TimeoutSec 2
            if ($response.ok -eq $true -and $response.service -eq "Codex Token Desk") { return }
        }
        catch {
            # Startup is still in progress.
        }
        Start-Sleep -Milliseconds 250
    } while ([DateTime]::UtcNow -lt $deadline)
    throw "Codex Token Desk did not become healthy within 25 seconds."
}

function Wait-ForPortRelease {
    $deadline = [DateTime]::UtcNow.AddSeconds(5)
    do {
        if ((Get-ListenerPid) -eq 0) { return $true }
        Start-Sleep -Milliseconds 100
    } while ([DateTime]::UtcNow -lt $deadline)
    return $false
}

function Get-ProcessTreeIds([int]$rootProcessId) {
    $processes = @(Get-CimInstance Win32_Process)
    $ids = New-Object System.Collections.Generic.List[int]
    $ids.Add($rootProcessId)
    for ($index = 0; $index -lt $ids.Count; $index++) {
        $parentId = $ids[$index]
        foreach ($child in $processes | Where-Object { [int]$_.ParentProcessId -eq $parentId }) {
            if (-not $ids.Contains([int]$child.ProcessId)) { $ids.Add([int]$child.ProcessId) }
        }
    }
    return @($ids)
}

function Wait-ForProcessTreeExit([int[]]$processIds) {
    $deadline = [DateTime]::UtcNow.AddSeconds(5)
    do {
        $remaining = @($processIds | Where-Object { Get-Process -Id $_ -ErrorAction SilentlyContinue })
        if ($remaining.Count -eq 0) { return }
        Start-Sleep -Milliseconds 100
    } while ([DateTime]::UtcNow -lt $deadline)
    throw "Killing the tray left service-tree process IDs alive: $($remaining -join ', ')."
}

if (-not (Test-Path -LiteralPath $Executable)) {
    throw "Tray executable was not found: $Executable"
}

if ((Get-ListenerPid) -ne 0) {
    throw "Port 3002 must be free before the lifecycle test starts."
}

try {
    $trayProcess = Start-Process -FilePath $Executable -PassThru -WindowStyle Hidden
    Wait-ForDashboard
    $listenerPid = Get-ListenerPid
    if ($listenerPid -le 0) { throw "The healthy dashboard had no listening process." }
    $state = Get-Content -Raw -LiteralPath $stateFile | ConvertFrom-Json
    $serviceTreeIds = Get-ProcessTreeIds ([int]$state.launcherProcessId)

    Stop-Process -Id $trayProcess.Id -Force
    $trayProcess.WaitForExit(5000) | Out-Null

    if (-not (Wait-ForPortRelease)) {
        throw "Killing the tray left the dashboard listening on port 3002 (PID $listenerPid)."
    }
    Wait-ForProcessTreeExit $serviceTreeIds

    Write-Host "PASS: killing the tray removed the complete service process tree within five seconds."
}
finally {
    if ($trayProcess -and -not $trayProcess.HasExited) {
        Stop-Process -Id $trayProcess.Id -Force -ErrorAction SilentlyContinue
    }
    if ((Get-ListenerPid) -ne 0) {
        & $Executable --exit
    }
}
