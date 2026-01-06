FROM node:18-slim AS builder
WORKDIR /app
COPY package*.json ./
COPY server/package*.json ./server/
RUN npm ci
COPY server/ ./server/
RUN cd server && npm run build

FROM node:18-slim
WORKDIR /app
COPY --from=builder /app/server/dist ./dist
COPY --from=builder /app/server/package*.json ./
RUN npm ci --only=production
EXPOSE 3001
CMD ["node", "dist/index.js"]
