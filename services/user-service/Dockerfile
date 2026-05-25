# ─────────────────────────────────────────────
#  Multi-stage Dockerfile for Node.js services
#  Copy this file into each service directory.
#  Works on arm64 (Raspberry Pi 4) and amd64.
# ─────────────────────────────────────────────

# Stage 1 — build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Stage 2 — production image
FROM node:20-alpine AS runner
WORKDIR /app

# Non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist

USER appuser
ENV NODE_ENV=production

EXPOSE 3000
CMD ["node", "dist/index.js"]
