# Stage 1 — build
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json ./
COPY shared/package.json ./shared/
COPY services/pet-service/package.json ./services/pet-service/
RUN npm install

COPY shared ./shared
COPY services/pet-service/tsconfig.json ./services/pet-service/
COPY services/pet-service/src ./services/pet-service/src

WORKDIR /app/services/pet-service
RUN npm run build

# Prune devDependencies from the workspace so the runner image stays lean
WORKDIR /app
RUN npm prune --omit=dev

# Stage 2 — production image (no network access needed)
FROM node:20-alpine AS runner
WORKDIR /app

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY services/pet-service/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/services/pet-service/dist ./dist

RUN mkdir -p /uploads && chown appuser:appgroup /uploads

USER appuser
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/index.js"]
