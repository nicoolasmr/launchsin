FROM node:18-slim AS builder
WORKDIR /app
COPY package*.json ./
COPY workers/package*.json ./workers/
RUN npm ci
COPY workers/ ./workers/
RUN cd workers && npm run build

FROM node:18-slim
WORKDIR /app
COPY --from=builder /app/workers/dist ./dist
COPY --from=builder /app/workers/package*.json ./
RUN npm ci --only=production
CMD ["node", "dist/index.ts"]
