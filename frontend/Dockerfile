# Development image for the Vite frontend.
FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

EXPOSE 5173

# --host is required inside a container; without it Vite binds to 127.0.0.1 and
# the port mapping has nothing to forward to.
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
