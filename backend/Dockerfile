# Development image for the API.
# The compose stack mounts the source as a volume and runs the watcher, so this
# image only needs the runtime plus dependencies.
FROM node:22-alpine

WORKDIR /app

# Install dependencies first so `docker compose build` reuses this layer when
# only application code changes.
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci && npx prisma generate

COPY . .

EXPOSE 4000

# Migrations are applied by the compose command, not here: a container that
# migrates on every boot would race itself when more than one replica starts.
CMD ["node", "src/index.js"]
