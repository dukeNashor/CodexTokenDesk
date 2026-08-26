param(
    [string]$Executable = (Join-Path (Split-Path $PSScriptRoot -Parent) "dist\CodexTokenDesk\CodexTokenDesk.exe")
)

$ErrorActionPreference = "Stop"
$repositoryRoot = Split-Path $PSScriptRoot -Parent
$dashboardUri = "http://127.0.0.1:3002/api/health"
$stateFile = Join-Path $env:LOCALAPPDATA "CodexTokenDesk\server.json"
$orphanId = [Guid]::NewGuid().ToString("N")
$orphanLauncher = $null
$orphanListenerPid = 0
$trayProcess = $null

function Get-ListenerPid {
    $connection = Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 3002 -State Listen -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($connection) { return [int]$connection.OwningProcess }
    return 0
}

function Get-Health {
    try {
        return Invoke-RestMethod -Uri ($dashboardUri + "?test=" + [Guid]::NewGuid().ToString("N")) -TimeoutSec 2
    }
    catch {
        return $null
    }
}

function Wait-ForHealthInstance([string]$expectedInstanceId, [int]$timeoutSeconds) {
    $deadline = [DateTime]::UtcNow.AddSeconds($timeoutSeconds)
    do {
        $health = Get-Health
        if ($health -and $health.instanceId -eq $expectedInstanceId) { return $health }
        Start-Sleep -Milliseconds 200
    } while ([DateTime]::UtcNow -lt $deadline)
    throw "The dashboard instance $expectedInstanceId did not become healthy within $timeoutSeconds seconds."
}

function Wait-ForReplacement([string]$previousInstanceId) {
    $deadline = [DateTime]::UtcNow.AddSeconds(25)
    do {
        $health = Get-Health
        if ($health -and -not [string]::IsNullOrWhiteSpace([string]$health.instanceId) -and $health.instanceId -ne $previousInstanceId) {
            return $health
        }
        Start-Sleep -Milliseconds 250
    } while ([DateTime]::UtcNow -lt $deadline)
    throw "The tray did not replace the verified orphan server within 25 seconds."
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
    throw "Replacing the orphan left process IDs alive: $($remaining -join ', ')."
}

if ((Get-ListenerPid) -ne 0) { throw "Port 3002 must be free before the owned-orphan test starts." }

try {
    $previousInstanceId = $env:CODEX_TOKEN_DESK_INSTANCE_ID
    $env:CODEX_TOKEN_DESK_INSTANCE_ID = $orphanId
    try {
        $orphanLauncher = Start-Process -FilePath "powershell.exe" -ArgumentList @(
            "-NoProfile",
            "-ExecutionPolicy", "Bypass",
            "-File", (Join-Path $repositoryRoot "scripts\start-dashboard.ps1"),
            "-Production"
        ) -WorkingDirectory $repositoryRoot -WindowStyle Hidden -PassThru
    }
    finally {
        if ($null -eq $previousInstanceId) { Remove-Item Env:\CODEX_TOKEN_DESK_INSTANCE_ID -ErrorAction SilentlyContinue }
        else { $env:CODEX_TOKEN_DESK_INSTANCE_ID = $previousInstanceId }
    }

    Wait-ForHealthInstance $orphanId 25 | Out-Null
    $orphanListenerPid = Get-ListenerPid
    $orphanListener = Get-Process -Id $orphanListenerPid
    $state = [ordered]@{
        version = 1
        instanceId = $orphanId
        port = 3002
        repositoryRoot = $repositoryRoot
        launcherProcessId = $orphanLauncher.Id
        launcherStartTimeUtcTicks = $orphanLauncher.StartTime.ToUniversalTime().Ticks
        listenerProcessId = $orphanListenerPid
        listenerStartTimeUtcTicks = $orphanListener.StartTime.ToUniversalTime().Ticks
    }
    New-Item -ItemType Directory -Force -Path (Split-Path $stateFile -Parent) | Out-Null
    $state | ConvertTo-Json -Compress | Set-Content -LiteralPath $stateFile -Encoding UTF8
    $orphanTreeIds = Get-ProcessTreeIds $orphanLauncher.Id

    $trayProcess = Start-Process -FilePath $Executable -PassThru -WindowStyle Hidden
    $replacement = Wait-ForReplacement $orphanId
    Wait-ForProcessTreeExit $orphanTreeIds

    Write-Host "PASS: the tray replaced a fully verified owned orphan with instance $($replacement.instanceId)."
}
finally {
    if ($trayProcess -and -not $trayProcess.HasExited) {
        Stop-Process -Id $trayProcess.Id -Force -ErrorAction SilentlyContinue
    }
    $listenerPid = Get-ListenerPid
    if ($listenerPid -ne 0) { Stop-Process -Id $listenerPid -Force -ErrorAction SilentlyContinue }
    if ($orphanLauncher -and -not $orphanLauncher.HasExited) {
        Stop-Process -Id $orphanLauncher.Id -Force -ErrorAction SilentlyContinue
    }
    if (Test-Path -LiteralPath $stateFile) { Remove-Item -LiteralPath $stateFile -Force }
}
