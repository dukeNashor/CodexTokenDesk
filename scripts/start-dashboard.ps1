param([switch]$Production)

$ErrorActionPreference = "Stop"

$pnpmCommand = Get-Command pnpm -ErrorAction SilentlyContinue
$pnpmPath = if ($pnpmCommand) { $pnpmCommand.Source } else {
  Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd"
}

if (-not (Test-Path -LiteralPath $pnpmPath)) {
  throw "pnpm was not found. Install Node.js/pnpm or restore the Codex runtime."
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  $bundledNodePath = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin"
  if (-not (Test-Path -LiteralPath (Join-Path $bundledNodePath "node.exe"))) {
    throw "Node.js was not found. Install Node.js or restore the Codex runtime."
  }
  $env:Path = "$bundledNodePath;$env:Path"
}

if ($Production) { & $pnpmPath start } else { & $pnpmPath dev }
