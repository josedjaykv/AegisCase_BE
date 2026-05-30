#!/usr/bin/env bash
#
# Levanta los 9 microservicios de AegisCase en paralelo, cada uno en modo --watch.
# La salida de cada servicio queda etiquetada con su nombre y puerto.
# Ctrl+C apaga todos los procesos hijos de una sola vez.
#
# Uso:
#   ./scripts/dev-all.sh            # levanta todo
#   ./scripts/dev-all.sh --no-media # levanta todo menos media-service
#
set -euo pipefail

cd "$(dirname "$0")/.."

# nombre|script|puerto
SERVICES=(
  "gateway|start:gateway|3000"
  "auth|start:auth|3001"
  "user|start:user|3002"
  "case|start:case|3003"
  "involved|start:involved|3004"
  "evidence|start:evidence|3005"
  "task|start:task|3006"
  "media|start:media|3007"
  "audit|start:audit|3008"
)

SKIP_MEDIA=false
for arg in "$@"; do
  case "$arg" in
    --no-media) SKIP_MEDIA=true ;;
    *) echo "Argumento desconocido: $arg" >&2; exit 1 ;;
  esac
done

PIDS=()

cleanup() {
  echo
  echo ">> Apagando servicios..."
  # Mata todo el grupo de procesos (incluye los hijos que abre nest --watch).
  for pid in "${PIDS[@]}"; do
    kill -TERM "-$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
  echo ">> Listo."
}
trap cleanup INT TERM EXIT

echo ">> Iniciando microservicios de AegisCase (Ctrl+C para detener todo)"
echo

for entry in "${SERVICES[@]}"; do
  IFS='|' read -r name script port <<< "$entry"

  if [[ "$name" == "media" && "$SKIP_MEDIA" == true ]]; then
    echo ">> Omitiendo media-service (--no-media)"
    continue
  fi

  # setsid -> cada servicio en su propio grupo de procesos para poder matarlos juntos.
  # La salida se prefija con [name:port] para distinguir los logs.
  setsid bash -c "npm run $script 2>&1 | sed -u \"s/^/[$name:$port] /\"" &
  PIDS+=("$!")
  echo ">> $name (puerto $port) -> PID $!"
done

echo
echo ">> Todos los servicios arrancando. Esperando... (Ctrl+C para salir)"
wait
