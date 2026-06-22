FROM node:22-alpine

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
USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]
