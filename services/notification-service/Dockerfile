# Stage 1 — build
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json ./
COPY shared/package.json ./shared/
COPY services/notification-service/package.json ./services/notification-service/
RUN npm install

COPY shared ./shared
COPY services/notification-service/tsconfig.json ./services/notification-service/
COPY services/notification-service/src ./services/notification-service/src

WORKDIR /app/services/notification-service
RUN npm run build

# Stage 2 — production image
FROM node:20-alpine AS runner
WORKDIR /app

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY services/notification-service/package.json ./
RUN npm install --omit=dev && npm cache clean --force

COPY --from=builder /app/services/notification-service/dist ./dist

USER appuser
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/index.js"]
