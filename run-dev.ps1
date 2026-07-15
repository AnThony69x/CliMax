# CliMax - arranca backend Laravel + instancias de Expo.
#
# Uso interactivo (recomendado):
#   .\run-dev.ps1                  # abre menu para elegir que encender
#
# Uso directo (flags):
#   .\run-dev.ps1 -All             # Todo (Laravel + Expo Go + Dev Client)
#   .\run-dev.ps1 -Backend         # Solo Laravel
#   .\run-dev.ps1 -ExpoGo          # Solo Expo Go
#   .\run-dev.ps1 -DevClient       # Solo Dev Client
#   .\run-dev.ps1 -Backend -ExpoGo # Laravel + Expo Go
#   .\run-dev.ps1 -Tunnel          # cualquier opcion + tunnel
#
# Opciones combinables:
#   -Tunnel   -> tunnel mode (funciona desde cualquier red, mas lento)
#   -SkipBackend -> no levanta Laravel (combinado con -All)

param(
  [switch]$Tunnel,
  [switch]$SkipBackend,
  [switch]$All,
  [switch]$Backend,
  [switch]$ExpoGo,
  [switch]$DevClient
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

# ── Determinar que encender ──────────────────
function Show-Menu {
  Clear-Host
  Write-Host ''
  Write-Host '  +----------------------------------+' -ForegroundColor Cyan
  Write-Host '  |       CliMax - Dev Menu           |' -ForegroundColor Cyan
  Write-Host '  |-----------------------------------|' -ForegroundColor Cyan
  Write-Host '  |  1)  Todo (Laravel + Expo Go +    |' -ForegroundColor White
  Write-Host '  |       Dev Client)                 |' -ForegroundColor White
  Write-Host '  |  2)  Solo Laravel (backend)       |' -ForegroundColor White
  Write-Host '  |  3)  Solo Expo Go (mobile)        |' -ForegroundColor White
  Write-Host '  |  4)  Solo Dev Client (mobile)     |' -ForegroundColor White
  Write-Host '  |  5)  Laravel + Expo Go            |' -ForegroundColor White
  Write-Host '  |  6)  Laravel + Dev Client         |' -ForegroundColor White
  Write-Host '  |  7)  Expo Go + Dev Client         |' -ForegroundColor White
  Write-Host '  |  0)  Salir                        |' -ForegroundColor White
  Write-Host '  +-----------------------------------+' -ForegroundColor Cyan
  Write-Host ''
}

$shouldRunBackend = $false
$shouldRunExpoGo = $false
$shouldRunDevClient = $false
$hasFlags = $All -or $Backend -or $ExpoGo -or $DevClient

# Backward compat: -SkipBackend solo = Expo Go + Dev Client
if ($SkipBackend -and -not $hasFlags) { $shouldRunExpoGo = $true; $shouldRunDevClient = $true; $hasFlags = $true }

if ($hasFlags) {
  # Modo flags
  if ($All -or $Backend) { $shouldRunBackend = $true }
  if ($ExpoGo) { $shouldRunExpoGo = $true }
  if ($DevClient) { $shouldRunDevClient = $true }
  if ($All) {
    $shouldRunExpoGo = $true
    $shouldRunDevClient = $true
  }
  if ($SkipBackend) { $shouldRunBackend = $false }
} else {
  # Sin flags: menu interactivo
  do {
    Show-Menu
    $choice = Read-Host '  ─> Opcion'
    switch ($choice) {
      '1' { $shouldRunBackend = $true; $shouldRunExpoGo = $true; $shouldRunDevClient = $true; $ok = $true }
      '2' { $shouldRunBackend = $true; $ok = $true }
      '3' { $shouldRunExpoGo = $true; $ok = $true }
      '4' { $shouldRunDevClient = $true; $ok = $true }
      '5' { $shouldRunBackend = $true; $shouldRunExpoGo = $true; $ok = $true }
      '6' { $shouldRunBackend = $true; $shouldRunDevClient = $true; $ok = $true }
      '7' { $shouldRunExpoGo = $true; $shouldRunDevClient = $true; $ok = $true }
      '0' { Write-Host '  Chao!'; exit 0 }
      default { Write-Host '  Opcion invalida, intenta de nuevo.' -ForegroundColor Red; Start-Sleep 1 }
    }
  } until ($ok)

  # Preguntar tunnel
  Write-Host ''
  $tunnelResp = Read-Host '  Usar tunnel? (s/N)'
  if ($tunnelResp -eq 's' -or $tunnelResp -eq 'S') { $Tunnel = $true }
}

Write-Host ''
Write-Host "  Arrancando: $(if ($shouldRunBackend) { 'Laravel' }) $(if ($shouldRunExpoGo) { 'Expo Go' }) $(if ($shouldRunDevClient) { 'Dev Client' })" -ForegroundColor Yellow
if ($Tunnel) { Write-Host '  Modo tunnel ACTIVO' -ForegroundColor Yellow }
Start-Sleep 1

# ── Limpiar puertos ──
Write-Host 'Limpiando puertos si quedaron zombies...' -ForegroundColor DarkCyan
$portsToFree = @()
if ($shouldRunExpoGo) { $portsToFree += 8001 }
if ($shouldRunDevClient) { $portsToFree += 8002 }
if ($shouldRunBackend) { $portsToFree += 8000 }
foreach ($p in $portsToFree) { Stop-PortIfBusy -Port $p }

$tunnelFlag = if ($Tunnel) { ' --tunnel' } else { '' }
$lanIp = Get-LanIPv4Address
$apiUrl = "http://$lanIp:8000/api"
$expoEnvPrefix = "`$expoTemp = '$mobileTempDir'; New-Item -ItemType Directory -Force -Path `$expoTemp | Out-Null; `$env:TEMP = `$expoTemp; `$env:TMP = `$expoTemp; `$env:EXPO_PUBLIC_API_URL = '$apiUrl';"

if ($shouldRunBackend) {
  Write-Host 'Iniciando Laravel (0.0.0.0:8000)...' -ForegroundColor Cyan
  Start-Process powershell -WorkingDirectory $backendDir -ArgumentList @(
    '-NoExit',
    '-Command',
    "`$Host.UI.RawUI.WindowTitle = 'CliMax - Laravel :8000'; php artisan serve --host=0.0.0.0 --port=8000"
  )
}

if ($shouldRunExpoGo) {
  Write-Host "Iniciando Expo Go (puerto 8001$(if ($Tunnel) { ' + tunnel' } else { '' }))..." -ForegroundColor Green
  Start-Process powershell -WorkingDirectory $mobileDir -ArgumentList @(
    '-NoExit',
    '-Command',
    "`$Host.UI.RawUI.WindowTitle = 'CliMax - Expo Go :8001'; $expoEnvPrefix Write-Host 'Modo Expo Go: escanea este QR con la app Expo Go (Play Store / App Store)' -ForegroundColor Yellow; npx expo start --go --port 8001$tunnelFlag --clear"
  )
}

if ($shouldRunDevClient) {
  Write-Host "Iniciando Expo Dev Client (puerto 8002$(if ($Tunnel) { ' + tunnel' } else { '' }))..." -ForegroundColor Magenta
  Start-Process powershell -WorkingDirectory $mobileDir -ArgumentList @(
    '-NoExit',
    '-Command',
    "`$Host.UI.RawUI.WindowTitle = 'CliMax - Expo Dev Client :8002'; $expoEnvPrefix Write-Host 'Modo Dev Client: escanea este QR con el APK CliMax (development build)' -ForegroundColor Yellow; npx expo start --dev-client --port 8002$tunnelFlag --clear"
  )
}

Write-Host ''
$count = @($shouldRunBackend, $shouldRunExpoGo, $shouldRunDevClient).Where({ $_ }).Count
Write-Host "Listo: $count ventanas abiertas." -ForegroundColor White
if ($shouldRunBackend)  { Write-Host "  - Laravel       :8000 (API)" }
if ($shouldRunExpoGo)   { Write-Host "  - Expo Go       :8001 (QR para Expo Go store app)" }
if ($shouldRunDevClient) { Write-Host "  - Dev Client    :8002 (QR para CliMax APK)" }
Write-Host "  - Mobile API URL: $apiUrl"
if ($Tunnel) {
  Write-Host '  Modo tunnel ACTIVO: bundles enrutados por servidores Expo (mas lento, pero funciona en redes con isolation).' -ForegroundColor Yellow
}
