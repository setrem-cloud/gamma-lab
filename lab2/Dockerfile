# ========================================
# Lab 2 - Dockerfile Multi-stage
# Cloud Computing - SETREM
# ========================================
FROM node:20-alpine
WORKDIR /app

RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup

COPY api/server.js ./
COPY api/package.json ./

USER appuser
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/healthz || exit 1
CMD ["node", "server.js"]