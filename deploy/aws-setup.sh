#!/usr/bin/env bash
#
# AegisCase — instalación y arranque en una instancia EC2 (Ubuntu).
#
# Qué hace:
#   1. Instala Docker + plugin de Docker Compose.
#   2. Clona los repos del backend y del frontend como carpetas hermanas.
#   3. Detecta la IP pública de la instancia y configura el FE para apuntar a ella.
#   4. Construye las imágenes (secuencial, para evitar timeouts de npm) y levanta todo.
#
# Uso (dos opciones):
#   A) Como "User data" al crear la EC2  -> pegá este contenido en el campo User data.
#   B) Manual tras conectarte por SSH     -> sudo bash aws-setup.sh
#
# IMPORTANTE: completá BE_REPO, FE_REPO y FE_BRANCH antes de usarlo.
# ---------------------------------------------------------------------------------

set -euo pipefail

# ─── CONFIGURACIÓN (EDITAR) ──────────────────────────────────────────────────────
# URLs git de los repos. Si son privados, usá un token:
#   https://<TOKEN>@github.com/usuario/AegisCase_BE.git
BE_REPO="${BE_REPO:-https://github.com/USUARIO/AegisCase_BE.git}"
FE_REPO="${FE_REPO:-https://github.com/USUARIO/AegisCase_FE.git}"
FE_BRANCH="${FE_BRANCH:-main}"          # rama del FE que tiene el Dockerfile (ej. phase_10)
BE_BRANCH="${BE_BRANCH:-main}"

WORKDIR="${WORKDIR:-/opt/aegiscase}"    # dónde se clonan los repos
# Si querés forzar la URL del API (ej. un dominio), seteá API_HOST; si no, se detecta sola.
API_HOST="${API_HOST:-}"
# ─────────────────────────────────────────────────────────────────────────────────

log() { echo -e "\n\033[1;36m==> $*\033[0m"; }

# 1) Docker + Compose ------------------------------------------------------------
if ! command -v docker >/dev/null 2>&1; then
  log "Instalando Docker..."
  apt-get update -y
  apt-get install -y ca-certificates curl git
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
  # Permitir usar docker sin sudo al usuario ubuntu (efectivo en el próximo login)
  usermod -aG docker ubuntu || true
else
  log "Docker ya está instalado."
fi

# 2) Clonar repos como carpetas hermanas -----------------------------------------
log "Preparando $WORKDIR ..."
mkdir -p "$WORKDIR"
cd "$WORKDIR"

if [ ! -d "$WORKDIR/AegisCase_BE/.git" ]; then
  log "Clonando backend..."
  git clone --branch "$BE_BRANCH" "$BE_REPO" AegisCase_BE
else
  log "Backend ya clonado; actualizando..."; git -C AegisCase_BE pull --ff-only || true
fi

if [ ! -d "$WORKDIR/AegisCase_FE/.git" ]; then
  log "Clonando frontend (rama $FE_BRANCH)..."
  git clone --branch "$FE_BRANCH" "$FE_REPO" AegisCase_FE
else
  log "Frontend ya clonado; actualizando..."; git -C AegisCase_FE pull --ff-only || true
fi

# 3) Detectar IP pública y configurar el .env ------------------------------------
if [ -z "$API_HOST" ]; then
  log "Detectando IP pública de la instancia (metadata)..."
  TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" \
            -H "X-aws-ec2-metadata-token-ttl-seconds: 300" || true)
  API_HOST=$(curl -s -H "X-aws-ec2-metadata-token: $TOKEN" \
            http://169.254.169.254/latest/meta-data/public-ipv4 || true)
fi
if [ -z "$API_HOST" ]; then
  echo "ERROR: no se pudo detectar la IP pública. Seteá API_HOST manualmente." >&2
  exit 1
fi
log "El frontend apuntará al gateway en: http://${API_HOST}:3000"

cd "$WORKDIR/AegisCase_BE"
# Partimos del .env.example y forzamos las 2 variables que importan para acceso público.
[ -f .env ] || cp .env.example .env
# VITE_API_BASE_URL: URL pública del gateway (se hornea en el build del FE).
grep -q '^VITE_API_BASE_URL=' .env \
  && sed -i "s#^VITE_API_BASE_URL=.*#VITE_API_BASE_URL=http://${API_HOST}:3000#" .env \
  || echo "VITE_API_BASE_URL=http://${API_HOST}:3000" >> .env
# CORS_ORIGIN=* -> el gateway refleja cualquier origen (origin:true). Permite acceso público.
grep -q '^CORS_ORIGIN=' .env \
  && sed -i "s#^CORS_ORIGIN=.*#CORS_ORIGIN=*#" .env \
  || echo "CORS_ORIGIN=*" >> .env

# 4) Build (secuencial) + arranque -----------------------------------------------
log "Construyendo imágenes (secuencial; la primera vez tarda varios minutos)..."
COMPOSE_PARALLEL_LIMIT=1 docker compose build

log "Levantando el sistema..."
docker compose up -d

log "Listo. Estado:"
docker compose ps

cat <<EOF

============================================================
  ✅ AegisCase desplegado
  Frontend:  http://${API_HOST}:4200
  API:       http://${API_HOST}:3000   (Swagger en /api/docs)
  Usuarios de prueba:
    admin@aegiscase.com     / Admin1234!
    detective@aegiscase.com / Detective1234!
    analyst@aegiscase.com   / Analyst1234!
============================================================
EOF
