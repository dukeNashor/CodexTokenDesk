param(
    [string]$Executable = (Join-Path (Split-Path $PSScriptRoot -Parent) "dist\CodexTokenDesk\CodexTokenDesk.exe")
)

$ErrorActionPreference = "Stop"
$repositoryRoot = Split-Path $PSScriptRoot -Parent
$dashboardUri = "http://127.0.0.1:3002/api/health"
$stateFile = Join-Path $env:LOCALAPPDATA "CodexTokenDesk\server.json"
$logFile = Join-Path $env:LOCALAPPDATA "CodexTokenDesk\logs\lifecycle.log"
$foreignId = [Guid]::NewGuid().ToString("N")
$foreignProcess = $null
$trayProcess = $null

function Get-ListenerPid {
    $connection = Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 3002 -State Listen -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($connection) { return [int]$connection.OwningProcess }
    return 0
}

function Wait-ForForeignHealth {
    $deadline = [DateTime]::UtcNow.AddSeconds(10)
    do {
        try {
            $health = Invoke-RestMethod -Uri ($dashboardUri + "?test=" + [Guid]::NewGuid().ToString("N")) -TimeoutSec 2
            if ($health.instanceId -eq $foreignId) { return }
        }
        catch {
            # Listener startup is still in progress.
        }
        Start-Sleep -Milliseconds 100
    } while ([DateTime]::UtcNow -lt $deadline)
    throw "The foreign listener did not become healthy."
}

function Wait-ForOwnershipRejection([DateTime]$startedAtUtc) {
    $deadline = [DateTime]::UtcNow.AddSeconds(10)
    do {
        if (Test-Path -LiteralPath $logFile) {
            foreach ($line in Get-Content -LiteralPath $logFile -Tail 30) {
                $parts = $line -split "`t", 3
                $timestamp = [DateTime]::MinValue
                if ($parts.Count -eq 3 -and [DateTime]::TryParse($parts[0], [ref]$timestamp) -and
                    $timestamp.ToUniversalTime() -ge $startedAtUtc -and $parts[1] -eq "ownership.rejected") {
                    return $parts[2]
                }
            }
        }
        Start-Sleep -Milliseconds 100
    } while ([DateTime]::UtcNow -lt $deadline)
    throw "The tray did not record an ownership rejection for the foreign listener."
}

if ((Get-ListenerPid) -ne 0) { throw "Port 3002 must be free before the foreign-listener test starts." }

try {
    $serverScript = @"
`$listener = New-Object System.Net.Sockets.TcpListener ([Net.IPAddress]::Parse('127.0.0.1')), 3002
`$listener.Start()
try {
    while (`$true) {
        `$client = `$listener.AcceptTcpClient()
        try {
            `$stream = `$client.GetStream()
            `$reader = New-Object IO.StreamReader(`$stream, [Text.Encoding]::ASCII, `$false, 1024, `$true)
            while ((`$line = `$reader.ReadLine()) -ne `$null -and `$line -ne '') { }
            `$body = '{"ok":true,"service":"Codex Token Desk","instanceId":"$foreignId","pollIntervalMs":3000}'
            `$payload = [Text.Encoding]::UTF8.GetBytes(`$body)
            `$headers = [Text.Encoding]::ASCII.GetBytes("HTTP/1.1 200 OK``r``nContent-Type: application/json``r``nContent-Length: `$(`$payload.Length)``r``nConnection: close``r``n``r``n")
            `$stream.Write(`$headers, 0, `$headers.Length)
            `$stream.Write(`$payload, 0, `$payload.Length)
            `$stream.Flush()
        }
        finally { `$client.Close() }
    }
}
finally { `$listener.Stop() }
"@
    $encodedCommand = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($serverScript))
    $foreignProcess = Start-Process -FilePath "powershell.exe" -ArgumentList "-NoProfile", "-EncodedCommand", $encodedCommand -WindowStyle Hidden -PassThru
    Wait-ForForeignHealth

    $listenerPid = Get-ListenerPid
    if ($listenerPid -ne $foreignProcess.Id) { throw "The foreign process did not own the test listener." }
    $state = [ordered]@{
        version = 1
        instanceId = $foreignId
        port = 3002
        repositoryRoot = $repositoryRoot
        launcherProcessId = $foreignProcess.Id
        launcherStartTimeUtcTicks = $foreignProcess.StartTime.ToUniversalTime().Ticks
        listenerProcessId = $foreignProcess.Id
        listenerStartTimeUtcTicks = $foreignProcess.StartTime.ToUniversalTime().Ticks
    }
    New-Item -ItemType Directory -Force -Path (Split-Path $stateFile -Parent) | Out-Null
    $state | ConvertTo-Json -Compress | Set-Content -LiteralPath $stateFile -Encoding UTF8

    $startedAtUtc = [DateTime]::UtcNow
    $trayProcess = Start-Process -FilePath $Executable -PassThru -WindowStyle Hidden
    $reason = Wait-ForOwnershipRejection $startedAtUtc
    if ($reason -ne "process chain mismatch") { throw "Unexpected rejection reason: $reason" }

    Wait-ForForeignHealth
    if ($foreignProcess.HasExited) { throw "The tray terminated the foreign listener." }

    Write-Host "PASS: the tray rejected the foreign listener without terminating it."
}
finally {
    if ($trayProcess -and -not $trayProcess.HasExited) {
        Stop-Process -Id $trayProcess.Id -Force -ErrorAction SilentlyContinue
    }
    if ($foreignProcess -and -not $foreignProcess.HasExited) {
        Stop-Process -Id $foreignProcess.Id -Force -ErrorAction SilentlyContinue
    }
    if (Test-Path -LiteralPath $stateFile) { Remove-Item -LiteralPath $stateFile -Force }
}
