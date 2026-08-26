$ErrorActionPreference = "Stop"

$root = Split-Path $PSScriptRoot -Parent
$compiler = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
$outputDirectory = Join-Path $root "dist\CodexTokenDesk"
$output = Join-Path $outputDirectory "CodexTokenDesk.exe"
$manifest = Join-Path $root "tray\app.manifest"
$sources = Get-ChildItem -LiteralPath (Join-Path $root "tray") -Filter "*.cs" | Select-Object -ExpandProperty FullName

if (-not (Test-Path -LiteralPath $compiler)) { throw ".NET Framework 4.8 compiler was not found." }
New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null

& $compiler /nologo /target:winexe /platform:anycpu /optimize+ /debug- `
  "/out:$output" "/win32manifest:$manifest" `
  /reference:System.dll /reference:System.Core.dll /reference:System.Drawing.dll /reference:System.Management.dll /reference:System.Runtime.Serialization.dll /reference:System.Windows.Forms.dll $sources

if ($LASTEXITCODE -ne 0) { throw "Tray application compilation failed." }
Copy-Item -LiteralPath (Join-Path $root "tray\README.txt") -Destination (Join-Path $outputDirectory "README.txt") -Force
Write-Host "Built $output"
