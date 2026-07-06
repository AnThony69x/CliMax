#!/usr/bin/env bash

# CliMax - arranca backend Laravel + 2 instancias de Expo (Expo Go y Dev Client).
#
# Uso:
#   ./run-dev.sh                 # LAN normal (escanear desde misma WiFi)
#   ./run-dev.sh --tunnel        # tunnel mode (funciona desde cualquier red, mas lento)
#   ./run-dev.sh --skip-backend  # no levanta Laravel (si ya esta corriendo)

set -euo pipefail

usage() {
  cat <<'EOF'
Uso: ./run-dev.sh [--tunnel] [--skip-backend] [--help]

  --tunnel        Usa Expo tunnel.
  --skip-backend  No levanta Laravel.
  --help          Muestra esta ayuda.
EOF
}

TUNNEL=false
SKIP_BACKEND=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --tunnel)
      TUNNEL=true
      ;;
    --skip-backend)
      SKIP_BACKEND=true
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      printf 'Argumento no reconocido: %s\n\n' "$1" >&2
      usage >&2
      exit 1
      ;;
  esac
  shift
done

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT/backend"
MOBILE_DIR="$ROOT/mobile"
MOBILE_TEMP_DIR="$MOBILE_DIR/.tmp"

if [[ ! -d "$BACKEND_DIR" ]]; then
  printf 'No se encuentra la carpeta backend: %s\n' "$BACKEND_DIR" >&2
  exit 1
fi

if [[ ! -d "$MOBILE_DIR" ]]; then
  printf 'No se encuentra la carpeta mobile: %s\n' "$MOBILE_DIR" >&2
  exit 1
fi

mkdir -p "$MOBILE_TEMP_DIR"

stop_port_if_busy() {
  local port="$1"
  local pids=""

  if command -v lsof >/dev/null 2>&1; then
    pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  elif command -v fuser >/dev/null 2>&1; then
    pids="$(fuser -n tcp "$port" 2>/dev/null || true)"
  elif command -v ss >/dev/null 2>&1; then
    pids="$(ss -ltnp "sport = :$port" 2>/dev/null | grep -oE 'pid=[0-9]+' | cut -d= -f2 | sort -u || true)"
  fi

  if [[ -z "$pids" ]]; then
    return
  fi

  for pid in $pids; do
    local process_name="desconocido"

    if [[ -r "/proc/$pid/comm" ]]; then
      process_name="$(<"/proc/$pid/comm")"
    fi

    if kill -9 "$pid" 2>/dev/null; then
      printf 'Puerto %s: matado proceso %s (PID %s)\n' "$port" "$process_name" "$pid"
    else
      printf 'Puerto %s: ocupado pero no se pudo liberar PID %s\n' "$port" "$pid" >&2
    fi
  done
}

get_lan_ipv4_address() {
  local ip=""
  local candidate

  if command -v ip >/dev/null 2>&1; then
    ip="$(ip route get 1.1.1.1 2>/dev/null | awk '{for (i = 1; i <= NF; i++) if ($i == "src") {print $(i + 1); exit}}')"
  fi

  if [[ -z "$ip" ]] && command -v hostname >/dev/null 2>&1; then
    for candidate in $(hostname -I 2>/dev/null); do
      case "$candidate" in
        127.*|169.254.*)
          ;;
        *)
          ip="$candidate"
          break
          ;;
      esac
    done
  fi

  if [[ -n "$ip" ]]; then
    printf '%s\n' "$ip"
  else
    printf 'localhost\n'
  fi
}

has_gui_terminal() {
  [[ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]]
}

open_or_background() {
  local title="$1"
  local workdir="$2"
  local command="$3"
  local log_file="$4"

  if has_gui_terminal; then
    if command -v ptyxis >/dev/null 2>&1; then
      ptyxis -s -d "$workdir" -T "$title" -- bash -lc "$command; exec bash" >/dev/null 2>&1 &
      return
    fi

    if command -v gnome-terminal >/dev/null 2>&1; then
      gnome-terminal --title="$title" --working-directory="$workdir" -- bash -lc "$command; exec bash" >/dev/null 2>&1 &
      return
    fi

    if command -v kgx >/dev/null 2>&1; then
      kgx --title "$title" --working-directory "$workdir" bash -lc "$command; exec bash" >/dev/null 2>&1 &
      return
    fi
  fi

  nohup bash -lc "cd \"$workdir\" && $command" >"$log_file" 2>&1 &
  printf 'Sin terminal grafica compatible, proceso enviado a background: %s\n' "$log_file"
}

printf 'Limpiando puertos 8000/8081/8082 si quedaron zombies...\n'
PORTS_TO_FREE=(8081 8082)
if [[ "$SKIP_BACKEND" == false ]]; then
  PORTS_TO_FREE=(8000 "${PORTS_TO_FREE[@]}")
fi

for port in "${PORTS_TO_FREE[@]}"; do
  stop_port_if_busy "$port"
done

TUNNEL_FLAG=()
if [[ "$TUNNEL" == true ]]; then
  TUNNEL_FLAG+=(--tunnel)
fi

LAN_IP="$(get_lan_ipv4_address)"
API_URL="http://$LAN_IP:8000/api"

EXPO_ENV=(
  "TMPDIR=$MOBILE_TEMP_DIR"
  "TMP=$MOBILE_TEMP_DIR"
  "TEMP=$MOBILE_TEMP_DIR"
  "EXPO_PUBLIC_API_URL=$API_URL"
)

if [[ "$SKIP_BACKEND" == false ]]; then
  printf 'Iniciando Laravel (0.0.0.0:8000)...\n'
  open_or_background \
    'CliMax - Laravel :8000' \
    "$BACKEND_DIR" \
    'php artisan serve --host=0.0.0.0 --port=8000' \
    "$MOBILE_TEMP_DIR/laravel.log"
fi

printf 'Iniciando Expo Go (puerto 8082%s)...\n' "$( [[ "$TUNNEL" == true ]] && printf ' + tunnel' || printf '' )"
open_or_background \
  'CliMax - Expo Go :8082' \
  "$MOBILE_DIR" \
  "${EXPO_ENV[*]} npx expo start --go --port 8082 ${TUNNEL_FLAG[*]} --clear" \
  "$MOBILE_TEMP_DIR/expo-go.log"

printf 'Iniciando Expo Dev Client (puerto 8081%s)...\n' "$( [[ "$TUNNEL" == true ]] && printf ' + tunnel' || printf '' )"
open_or_background \
  'CliMax - Expo Dev Client :8081' \
  "$MOBILE_DIR" \
  "${EXPO_ENV[*]} npx expo start --dev-client --port 8081 ${TUNNEL_FLAG[*]} --clear" \
  "$MOBILE_TEMP_DIR/expo-dev-client.log"

printf '\nListo.\n'
printf '  - Laravel       :8000 (API)\n'
printf '  - Mobile API URL: %s\n' "$API_URL"
printf '  - Expo Go       :8082 (QR para Expo Go store app)\n'
printf '  - Dev Client    :8081 (QR para CliMax APK)\n'

if [[ "$TUNNEL" == true ]]; then
  printf '  Modo tunnel ACTIVO: bundles enrutados por servidores Expo (mas lento, pero funciona en redes con isolation).\n'
fi
