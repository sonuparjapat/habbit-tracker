# Anchor website + admin panel — production image
#   docker build -t anchor-web --build-arg NEXT_PUBLIC_API_URL=https://api.yourdomain.com/api --build-arg NEXT_PUBLIC_SITE_URL=https://yourdomain.com ./web
#   docker run -p 3000:3000 anchor-web
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# NEXT_PUBLIC_* values are baked in at build time
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_APP_NAME=Anchor
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_PLAY_STORE_URL
ARG NEXT_PUBLIC_SUPPORT_EMAIL
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/next.config.mjs ./
USER node
EXPOSE 3000
CMD ["npx", "next", "start", "-p", "3000"]
