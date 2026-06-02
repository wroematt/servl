# Stage 1 — build
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json ./
COPY worker/package.json ./worker/
RUN npm install

COPY worker/tsconfig.json ./worker/
COPY worker/index.ts ./worker/

WORKDIR /app/worker
RUN npm run build

# Prune devDependencies from the workspace so the runner image stays lean
WORKDIR /app
RUN npm prune --omit=dev

# Stage 2 — production image (no network access needed)
FROM node:20-alpine AS runner
WORKDIR /app

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY worker/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/worker/dist ./dist

USER appuser
ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
