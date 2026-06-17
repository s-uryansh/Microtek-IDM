FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json ./server/package.json
RUN npm ci --omit=dev --workspace server

COPY server/src/ ./server/src/
# Migrations live at the repo root and are read by src/db/migrate.js
# (resolved as ../../../db/migrations). They must be in the image so
# `npm run migrate` can run in the container.
COPY db/ ./db/

EXPOSE 4000

WORKDIR /app/server
CMD ["node", "src/server.js"]
