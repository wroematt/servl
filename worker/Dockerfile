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

# Stage 2 — production image
FROM node:20-alpine AS runner
WORKDIR /app

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY worker/package.json ./
RUN npm install --omit=dev && npm cache clean --force

COPY --from=builder /app/worker/dist ./dist

USER appuser
ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
