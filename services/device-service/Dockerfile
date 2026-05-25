# Stage 1 — build
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json ./
COPY shared/package.json ./shared/
COPY services/device-service/package.json ./services/device-service/
RUN npm install

COPY shared ./shared
COPY services/device-service/tsconfig.json ./services/device-service/
COPY services/device-service/src ./services/device-service/src

WORKDIR /app/services/device-service
RUN npm run build

# Stage 2 — production image
FROM node:20-alpine AS runner
WORKDIR /app

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY services/device-service/package.json ./
RUN npm install --omit=dev && npm cache clean --force

COPY --from=builder /app/services/device-service/dist ./dist

USER appuser
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/index.js"]
