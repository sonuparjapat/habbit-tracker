# Anchor API — production image
#   docker build -t anchor-api ./backend
#   docker run -p 4000:4000 --env-file backend/.env anchor-api
# Tables are created automatically on start.
FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src
COPY scripts ./scripts

USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT:-4000}/health || exit 1

CMD ["node", "src/index.js"]
