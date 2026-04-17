# ========================================
# Lab 2 - Dockerfile Multi-stage
# Cloud Computing - SETREM
#
# Contexto de build: lab2/ (definido no ci.yml)
# ========================================

# Stage 1: Instalar dependencias
FROM node:20-alpine AS builder
WORKDIR /app
COPY api/package*.json ./
RUN npm ci --only=production

# Stage 2: Imagem final (minima)
FROM node:20-alpine
WORKDIR /app

# Usuario nao-root (boa pratica de seguranca)
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup

COPY --from=builder /app/node_modules ./node_modules
COPY api/server.js ./
COPY api/package.json ./

USER appuser
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/healthz || exit 1

CMD ["node", "server.js"]
