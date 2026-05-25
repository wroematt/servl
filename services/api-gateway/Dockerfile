# Stage 1 — build
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json ./
COPY shared/package.json ./shared/
COPY services/api-gateway/package.json ./services/api-gateway/
RUN npm install

COPY shared ./shared
COPY services/api-gateway/tsconfig.json ./services/api-gateway/
COPY services/api-gateway/src ./services/api-gateway/src

WORKDIR /app/services/api-gateway
RUN npm run build

# Stage 2 — production image
FROM node:20-alpine AS runner
WORKDIR /app

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY services/api-gateway/package.json ./
RUN npm install --omit=dev && npm cache clean --force

COPY --from=builder /app/services/api-gateway/dist ./dist

USER appuser
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/index.js"]
