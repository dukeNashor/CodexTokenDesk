param(
    [string]$OutputDirectory = (Join-Path (Split-Path $PSScriptRoot -Parent) "dist\CodexTokenDesk-standalone-win-x64"),
    [string]$NodeVersion = "24.19.0",
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

$root = Split-Path $PSScriptRoot -Parent
$sourceDistDirectory = Join-Path $root "dist\CodexTokenDesk"
$standaloneSource = Join-Path $root ".next\standalone"
$nodeArchiveName = "node-v{0}-win-x64.zip" -f $NodeVersion
$nodeBaseUrl = "https://nodejs.org/dist/v{0}" -f $NodeVersion
$cacheDirectory = Join-Path $env:TEMP "codex-token-desk-node-cache"
$nodeArchivePath = Join-Path $cacheDirectory $nodeArchiveName
$nodeChecksumsPath = Join-Path $cacheDirectory "SHASUMS256-$NodeVersion.txt"
$zipPath = "{0}.zip" -f $OutputDirectory
$pnpmCommand = Get-Command pnpm -ErrorAction SilentlyContinue
$pnpmPath = if ($pnpmCommand) { $pnpmCommand.Source } else {
    Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd"
}

function Assert-PathUnderDirectory([string]$Path, [string]$Parent) {
    $fullPath = [System.IO.Path]::GetFullPath($Path).TrimEnd('\')
    $fullParent = [System.IO.Path]::GetFullPath($Parent).TrimEnd('\') + '\'
    if (-not $fullPath.StartsWith($fullParent, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Output path must stay under $Parent."
    }
}

function Copy-StandaloneTree([string]$Source, [string]$Destination, [string]$ProjectNodeModulesRoot, [string]$StandaloneSourceNodeModulesRoot) {
    $item = Get-Item -LiteralPath $Source -Force
    if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
        $target = [string]$item.Target
        $sourceRoot = [System.IO.Path]::GetFullPath($ProjectNodeModulesRoot).TrimEnd('\') + '\'
        $fullTarget = [System.IO.Path]::GetFullPath($target)
        if (-not $fullTarget.StartsWith($sourceRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
            throw "Standalone dependency link points outside node_modules: $Source"
        }
        $relativeTarget = $fullTarget.Substring($sourceRoot.Length)
        $mappedTarget = Join-Path $StandaloneSourceNodeModulesRoot $relativeTarget
        if (-not (Test-Path -LiteralPath $mappedTarget)) {
            throw "Standalone dependency link target was not traced: $mappedTarget"
        }
        Copy-StandaloneTree $mappedTarget $Destination $ProjectNodeModulesRoot $StandaloneSourceNodeModulesRoot
        return
    }

    if ($item.PSIsContainer) {
        New-Item -ItemType Directory -Force -Path $Destination | Out-Null
        foreach ($child in Get-ChildItem -LiteralPath $Source -Force) {
            Copy-StandaloneTree $child.FullName (Join-Path $Destination $child.Name) $ProjectNodeModulesRoot $StandaloneSourceNodeModulesRoot
        }
        return
    }

    Copy-Item -LiteralPath $Source -Destination $Destination -Force
}

if (-not (Test-Path -LiteralPath $pnpmPath)) { throw "pnpm was not found. Install pnpm or restore the Codex runtime." }
Assert-PathUnderDirectory $OutputDirectory (Join-Path $root "dist")

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    $bundledNodeDirectory = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin"
    if (Test-Path -LiteralPath (Join-Path $bundledNodeDirectory "node.exe")) {
        $env:Path = "$bundledNodeDirectory;$env:Path"
    }
}

if (-not $SkipBuild) {
    & $pnpmPath build
    if ($LASTEXITCODE -ne 0) { throw "Next.js standalone build failed." }

    & (Join-Path $root "scripts\build-tray-app.ps1")
    if ($LASTEXITCODE -ne 0) { throw "Tray application build failed." }
}

if (-not (Test-Path -LiteralPath (Join-Path $standaloneSource "server.js"))) {
    throw "Missing .next\standalone\server.js. Run a successful standalone build first."
}

if (-not (Test-Path -LiteralPath (Join-Path $sourceDistDirectory "CodexTokenDesk.exe"))) {
    throw "Missing dist\CodexTokenDesk\CodexTokenDesk.exe. Build the tray application first."
}

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
New-Item -ItemType Directory -Force -Path $cacheDirectory | Out-Null

if (-not (Test-Path -LiteralPath $nodeArchivePath)) {
    Invoke-WebRequest -Uri "$nodeBaseUrl/$nodeArchiveName" -OutFile $nodeArchivePath
}
if (-not (Test-Path -LiteralPath $nodeChecksumsPath)) {
    Invoke-WebRequest -Uri "$nodeBaseUrl/SHASUMS256.txt" -OutFile $nodeChecksumsPath
}

$checksumLine = Get-Content -LiteralPath $nodeChecksumsPath |
    Where-Object { $_ -match "\s$([regex]::Escape($nodeArchiveName))$" } |
    Select-Object -First 1
if (-not $checksumLine) { throw "Node.js checksum was not found for $nodeArchiveName." }
$expectedChecksum = ($checksumLine -split '\s+')[0].ToLowerInvariant()
$sha256 = [System.Security.Cryptography.SHA256]::Create()
try {
    $archiveStream = [System.IO.File]::OpenRead($nodeArchivePath)
    try {
        $actualChecksum = [System.BitConverter]::ToString($sha256.ComputeHash($archiveStream)).Replace("-", "").ToLowerInvariant()
    }
    finally {
        $archiveStream.Dispose()
    }
}
finally {
    $sha256.Dispose()
}
if ($actualChecksum -ne $expectedChecksum) {
    throw "Node.js archive checksum mismatch for $nodeArchiveName."
}

if (Test-Path -LiteralPath $OutputDirectory) {
    Remove-Item -LiteralPath $OutputDirectory -Recurse -Force
}
if (Test-Path -LiteralPath $zipPath) {
    Remove-Item -LiteralPath $zipPath -Force
}
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null

$extractDirectory = Join-Path $cacheDirectory "extract-$NodeVersion"
if (-not (Test-Path -LiteralPath (Join-Path $extractDirectory "node-v$NodeVersion-win-x64\node.exe"))) {
    if (Test-Path -LiteralPath $extractDirectory) { Remove-Item -LiteralPath $extractDirectory -Recurse -Force }
    Expand-Archive -LiteralPath $nodeArchivePath -DestinationPath $extractDirectory
}

$nodeSource = Join-Path $extractDirectory "node-v$NodeVersion-win-x64\node.exe"
if (-not (Test-Path -LiteralPath $nodeSource)) { throw "The Node.js archive did not contain node.exe." }

Copy-Item -LiteralPath (Join-Path $sourceDistDirectory "CodexTokenDesk.exe") -Destination (Join-Path $OutputDirectory "CodexTokenDesk.exe")
Copy-Item -LiteralPath (Join-Path $root "tray\README.txt") -Destination (Join-Path $OutputDirectory "README.txt")

$standaloneTarget = Join-Path $OutputDirectory ".next\standalone"
New-Item -ItemType Directory -Force -Path $standaloneTarget | Out-Null
foreach ($runtimeEntry in @("server.js", "package.json", ".next")) {
    $sourceEntry = Join-Path $standaloneSource $runtimeEntry
    if (-not (Test-Path -LiteralPath $sourceEntry)) { throw "Missing standalone runtime entry: $runtimeEntry" }
    Copy-Item -LiteralPath $sourceEntry -Destination (Join-Path $standaloneTarget $runtimeEntry) -Recurse
}
$sourceNodeModules = Join-Path $standaloneSource "node_modules"
$targetNodeModules = Join-Path $standaloneTarget "node_modules"
if (-not (Test-Path -LiteralPath $sourceNodeModules)) { throw "Missing standalone runtime entry: node_modules" }
New-Item -ItemType Directory -Force -Path $targetNodeModules | Out-Null
$nextPackage = Get-ChildItem -LiteralPath (Join-Path $sourceNodeModules ".pnpm") -Directory |
    Where-Object { $_.Name -like "next@*" } |
    Select-Object -First 1
if (-not $nextPackage) { throw "Missing traced Next.js package in standalone node_modules." }
$flatDependencySources = @(
    (Join-Path $sourceNodeModules ".pnpm\node_modules"),
    (Join-Path $nextPackage.FullName "node_modules")
)
foreach ($dependencySource in $flatDependencySources) {
    if (-not (Test-Path -LiteralPath $dependencySource)) { throw "Missing standalone dependency directory: $dependencySource" }
    foreach ($dependency in Get-ChildItem -LiteralPath $dependencySource -Force) {
        Copy-StandaloneTree $dependency.FullName (Join-Path $targetNodeModules $dependency.Name) (Join-Path $root "node_modules") $sourceNodeModules
    }
}
$staticSource = Join-Path $root ".next\static"
if (Test-Path -LiteralPath $staticSource) {
    New-Item -ItemType Directory -Force -Path (Join-Path $standaloneTarget ".next") | Out-Null
    Copy-Item -LiteralPath $staticSource -Destination (Join-Path $standaloneTarget ".next\static") -Recurse
}
$publicSource = Join-Path $root "public"
if (Test-Path -LiteralPath $publicSource) {
    Copy-Item -LiteralPath $publicSource -Destination (Join-Path $standaloneTarget "public") -Recurse
}

$nodeTargetDirectory = Join-Path $OutputDirectory "runtime\node"
New-Item -ItemType Directory -Force -Path $nodeTargetDirectory | Out-Null
Copy-Item -LiteralPath $nodeSource -Destination (Join-Path $nodeTargetDirectory "node.exe")

Compress-Archive -Path (Join-Path $OutputDirectory "*") -DestinationPath $zipPath -CompressionLevel Optimal
$packageBytes = (Get-ChildItem -LiteralPath $OutputDirectory -File -Recurse | Measure-Object -Property Length -Sum).Sum
$zipBytes = (Get-Item -LiteralPath $zipPath).Length
Write-Host "Built standalone package: $OutputDirectory"
Write-Host "Runtime files: $([Math]::Round($packageBytes / 1MB, 2)) MB"
Write-Host "ZIP: $zipPath ($([Math]::Round($zipBytes / 1MB, 2)) MB)"
