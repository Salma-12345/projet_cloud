# =====================================================================
#  Image de l'application (interface React + API Node.js dans un seul conteneur)
#  Construction en 3 étapes : interface -> dépendances serveur -> image finale légère
# =====================================================================

# --- Étape 1 : construction de l'interface web (React + Vite, PWA) ---
FROM node:22-alpine AS interface
WORKDIR /client
COPY client/package.json client/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY client/ ./
RUN npm run build

# --- Étape 2 : dépendances du serveur (production uniquement) ---
FROM node:22-alpine AS dependances
WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# --- Étape 3 : image finale ---
FROM node:22-alpine
RUN apk add --no-cache tzdata
ENV NODE_ENV=production \
    PORT=3000 \
    TZ=Africa/Tunis \
    PUBLIC_DIR=/app/public \
    UPLOADS_DIR=/app/uploads
WORKDIR /app
COPY --from=dependances /app/node_modules ./node_modules
COPY server/package.json ./
COPY server/src ./src
COPY server/tests ./tests
COPY --from=interface /client/dist ./public
RUN mkdir -p /app/uploads && chown -R node:node /app/uploads
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/sante || exit 1
CMD ["node", "src/index.js"]
