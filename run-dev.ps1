# CliMax - arranca backend Laravel + 2 instancias de Expo (Expo Go y Dev Client).
#
# Uso:
#   .\run-dev.ps1                # LAN normal (escanear desde misma WiFi)
#   .\run-dev.ps1 -Tunnel        # tunnel mode (funciona desde cualquier red, mas lento)
#   .\run-dev.ps1 -SkipBackend   # no levanta Laravel (si ya esta corriendo)
#
# Ventanas que abre:
#   1. Laravel    -> http://0.0.0.0:8000
#   2. Expo Go    -> puerto 8001 (QR para Expo Go del App Store / Play Store)
#   3. Dev Client -> puerto 8002 (QR para el APK CliMax instalado en tu phone)

param(
  [switch]$Tunnel,
  [switch]$SkipBackend
)

$ErrorActionPreference = 'Stop'
$Root = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }

$backendDir = Join-Path $Root 'backend'
$mobileDir  = Join-Path $Root 'mobile'
$mobileTempDir = Join-Path $mobileDir '.tmp'

if (-not (Test-Path $backendDir)) {
  Write-Error "No se encuentra la carpeta backend: $backendDir"
  exit 1
}
if (-not (Test-Path $mobileDir)) {
  Write-Error "No se encuentra la carpeta mobile: $mobileDir"
  exit 1
}

function Stop-PortIfBusy {
  param([int]$Port)
  $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  if ($conn) {
    $procId = $conn[0].OwningProcess
    try {
      $proc = Get-Process -Id $procId -ErrorAction Stop
      Stop-Process -Id $procId -Force -ErrorAction Stop
      Write-Host ("Puerto {0}: matado proceso {1} (PID {2})" -f $Port, $proc.ProcessName, $procId) -ForegroundColor DarkYellow
    } catch {
      Write-Host ("Puerto {0}: ocupado pero no se pudo liberar PID {1}" -f $Port, $procId) -ForegroundColor Red
    }
  }
}

function Get-LanIPv4Address {
  $ip = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object {
      $_.IPAddress -notlike '169.254.*' -and
      $_.IPAddress -ne '127.0.0.1' -and
      $_.PrefixOrigin -ne 'WellKnown'
    } |
    Sort-Object -Property InterfaceMetric, SkipAsSource |
    Select-Object -First 1 -ExpandProperty IPAddress

  if ($ip) { return $ip }

  return 'localhost'
}

Write-Host 'Limpiando puertos 8000/8001/8002 si quedaron zombies...' -ForegroundColor DarkCyan
$portsToFree = @(8001, 8002)
if (-not $SkipBackend) { $portsToFree = @(8000) + $portsToFree }
foreach ($p in $portsToFree) { Stop-PortIfBusy -Port $p }

$tunnelFlag = if ($Tunnel) { ' --tunnel' } else { '' }
$lanIp = Get-LanIPv4Address
$apiUrl = "http://$lanIp:8000/api"
$expoEnvPrefix = "`$expoTemp = '$mobileTempDir'; New-Item -ItemType Directory -Force -Path `$expoTemp | Out-Null; `$env:TEMP = `$expoTemp; `$env:TMP = `$expoTemp; `$env:EXPO_PUBLIC_API_URL = '$apiUrl';"

if (-not $SkipBackend) {
  Write-Host 'Iniciando Laravel (0.0.0.0:8000)...' -ForegroundColor Cyan
  Start-Process powershell -WorkingDirectory $backendDir -ArgumentList @(
    '-NoExit',
    '-Command',
    "`$Host.UI.RawUI.WindowTitle = 'CliMax - Laravel :8000'; php artisan serve --host=0.0.0.0 --port=8000"
  )
}

Write-Host "Iniciando Expo Go (puerto 8001$(if ($Tunnel) { ' + tunnel' } else { '' }))..." -ForegroundColor Green
Start-Process powershell -WorkingDirectory $mobileDir -ArgumentList @(
  '-NoExit',
  '-Command',
  "`$Host.UI.RawUI.WindowTitle = 'CliMax - Expo Go :8001'; $expoEnvPrefix Write-Host 'Modo Expo Go: escanea este QR con la app Expo Go (Play Store / App Store)' -ForegroundColor Yellow; npx expo start --go --port 8001$tunnelFlag --clear"
)

Write-Host "Iniciando Expo Dev Client (puerto 8002$(if ($Tunnel) { ' + tunnel' } else { '' }))..." -ForegroundColor Magenta
Start-Process powershell -WorkingDirectory $mobileDir -ArgumentList @(
  '-NoExit',
  '-Command',
  "`$Host.UI.RawUI.WindowTitle = 'CliMax - Expo Dev Client :8002'; $expoEnvPrefix Write-Host 'Modo Dev Client: escanea este QR con el APK CliMax (development build)' -ForegroundColor Yellow; npx expo start --dev-client --port 8002$tunnelFlag --clear"
)

Write-Host ''
Write-Host 'Listo: 3 ventanas abiertas.' -ForegroundColor White
Write-Host '  - Laravel       :8000 (API)'
Write-Host "  - Mobile API URL: $apiUrl"
Write-Host '  - Expo Go       :8001 (QR para Expo Go store app)'
Write-Host '  - Dev Client    :8002 (QR para CliMax APK)'
if ($Tunnel) {
  Write-Host '  Modo tunnel ACTIVO: bundles enrutados por servidores Expo (mas lento, pero funciona en redes con isolation).' -ForegroundColor Yellow
}
