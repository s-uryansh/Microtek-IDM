FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json ./server/package.json
RUN npm ci --omit=dev --workspace server

COPY server/src/ ./server/src/

EXPOSE 4000

WORKDIR /app/server
CMD ["node", "src/server.js"]
