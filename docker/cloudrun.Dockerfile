# Single-container image for Cloud Run: the API server also serves the built client.
# Build context: repository root. (The Docker Compose production stack uses
# server.Dockerfile + web.Dockerfile with Caddy instead.)

FROM node:24-alpine AS client
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ .
RUN npm run build

FROM node:24-alpine AS server
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci
COPY server/ .
RUN npm run build

FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=server /app/server/dist ./dist
COPY --from=client /app/client/dist /app/client
ENV CLIENT_DIR=/app/client
USER node
# Cloud Run sets PORT (8080); the server reads it
EXPOSE 8080
CMD ["node", "dist/index.js"]
