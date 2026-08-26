param([switch]$SkipBuild)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent

if (-not $SkipBuild) {
    & (Join-Path $root "scripts\build-tray-app.ps1")
}

$tests = @(
    "tray-lifecycle.Tests.ps1",
    "tray-identity.Tests.ps1",
    "tray-owned-orphan.Tests.ps1",
    "tray-foreign-listener.Tests.ps1",
    "tray-server-exit.Tests.ps1",
    "tray-commands.Tests.ps1"
)

foreach ($test in $tests) {
    Write-Host "Running $test"
    & (Join-Path $PSScriptRoot $test)
}

Write-Host "All tray integration tests passed."
