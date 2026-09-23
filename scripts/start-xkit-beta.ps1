param(
  [ValidateRange(1, 65535)]
  [int]$Port = 3002
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$authToken = $null
$ct0 = $null
$exitCode = 1

function Convert-SecureInputToPlainText {
  param([Parameter(Mandatory)][System.Security.SecureString]$Value)

  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)
  try {
    [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  }
  finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  }
}

try {
  $listener = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
  if ($listener) {
    throw "Port $Port is already in use. Choose another port with -Port, for example -Port 3003."
  }

  $authInput = Read-Host "Paste your X auth_token (input is hidden; it will not be saved)" -AsSecureString
  $ct0Input = Read-Host "Paste your X ct0 (input is hidden; it will not be saved)" -AsSecureString
  $authToken = Convert-SecureInputToPlainText -Value $authInput
  $ct0 = Convert-SecureInputToPlainText -Value $ct0Input

  if ([string]::IsNullOrWhiteSpace($authToken) -or [string]::IsNullOrWhiteSpace($ct0)) {
    throw "Both cookie values are required. No values were saved."
  }

  Push-Location $repoRoot
  try {
    $env:XKIT_LOCAL_TEST = "true"
    $env:XKIT_AUTH_TOKEN = $authToken
    $env:XKIT_CT0 = $ct0
    Write-Host "Starting local xKit Beta on http://localhost:$Port (Ctrl+C to stop)."
    npm run dev -- -p $Port
    $exitCode = $LASTEXITCODE
  }
  finally {
    Remove-Item Env:XKIT_LOCAL_TEST, Env:XKIT_AUTH_TOKEN, Env:XKIT_CT0 -ErrorAction SilentlyContinue
    Pop-Location
  }
}
catch {
  Write-Error $_.Exception.Message
  $exitCode = 1
}
finally {
  $authToken = $null
  $ct0 = $null
  if ($authInput) { $authInput.Dispose() }
  if ($ct0Input) { $ct0Input.Dispose() }
}

exit $exitCode
