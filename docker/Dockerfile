# Build stage
FROM node:22-alpine AS builder

ARG SERVICE
ENV SERVICE=${SERVICE}

WORKDIR /app

COPY package*.json ./
COPY tsconfig.json ./
COPY nest-cli.json ./

RUN npm ci

COPY apps/ ./apps/
COPY libs/ ./libs/

RUN npm run build -- ${SERVICE}

# Production stage
FROM node:22-alpine AS runner

ARG SERVICE
ENV SERVICE=${SERVICE}
ENV NODE_ENV=production

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

EXPOSE 3000

# El build del monorepo anida la salida en dist/apps/<svc>/apps/<svc>/src/main.js
# (tsc preserva la estructura de carpetas por las libs compartidas). Resolvemos
# la ruta real de main.js en tiempo de arranque en lugar de asumirla.
CMD node "$(find dist/apps/${SERVICE} -name main.js | head -1)"
