# Stage 1 — build
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json ./
COPY shared/package.json ./shared/
COPY services/user-service/package.json ./services/user-service/
RUN npm install

COPY shared ./shared
COPY services/user-service/tsconfig.json ./services/user-service/
COPY services/user-service/src ./services/user-service/src

WORKDIR /app/services/user-service
RUN npm run build

# Stage 2 — production image
FROM node:20-alpine AS runner
WORKDIR /app

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY services/user-service/package.json ./
RUN npm install --omit=dev && npm cache clean --force

COPY --from=builder /app/services/user-service/dist ./dist

USER appuser
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/index.js"]
