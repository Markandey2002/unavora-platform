FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
# Read at build time: the public origin, and the approved-media origin allowed by next/image (next.config.ts).
# Each environment therefore gets its own image (see .github/workflows/deploy-env.yml).
ARG NEXT_PUBLIC_SITE_URL=http://localhost:3000
ARG MEDIA_PUBLIC_URL=http://localhost:8080/api/v1/public/media/
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    MEDIA_PUBLIC_URL=$MEDIA_PUBLIC_URL \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
# HOSTNAME: the standalone server binds to it; Docker sets it to the container id otherwise.
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
USER app
EXPOSE 3000
CMD ["node","server.js"]
