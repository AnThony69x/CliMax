# CliMax — arranca backend Laravel (8000) y Expo (9000) en ventanas separadas.
# Uso:  powershell -ExecutionPolicy Bypass -File .\run-dev.sp

$ErrorActionPreference = 'Stop'
$Root = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }

$backendDir = Join-Path $Root 'backend'
$mobileDir  = Join-Path $Root 'mobile'

if (-not (Test-Path $backendDir)) {
  Write-Error "No se encuentra la carpeta backend: $backendDir"
  exit 1
}
if (-not (Test-Path $mobileDir)) {
  Write-Error "No se encuentra la carpeta mobile: $mobileDir"
  exit 1
}

Write-Host 'Iniciando Laravel (0.0.0.0:8000)...'
Start-Process powershell -WorkingDirectory $backendDir -ArgumentList @(
  '-NoExit',
  '-Command',
  'php artisan serve --host=0.0.0.0 --port=8000'
)

Write-Host 'Iniciando Expo (puerto 9000)...'
Start-Process powershell -WorkingDirectory $mobileDir -ArgumentList @(
  '-NoExit',
  '-Command',
  'npx expo start --port=9000'
)

Write-Host 'Listo: dos ventanas de PowerShell quedaron abiertas.'
