param(
  [ValidateRange(1, 65535)]
  [int]$Port = 3002
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$exitCode = 1

try {
  $listener = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
  if ($listener) {
    throw "Port $Port is already in use. Choose another port with -Port, for example -Port 3003."
  }

  Push-Location $repoRoot
  try {
    $env:XKIT_LOCAL_TEST = "true"
    Write-Host "Starting local xKit Beta on http://localhost:$Port (Ctrl+C to stop)."
    npm run dev -- -H 127.0.0.1 -p $Port
    $exitCode = $LASTEXITCODE
  }
  finally {
    Remove-Item Env:XKIT_LOCAL_TEST -ErrorAction SilentlyContinue
    Pop-Location
  }
}
catch {
  Write-Error $_.Exception.Message
  $exitCode = 1
}
exit $exitCode
