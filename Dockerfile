# Self-hosted image for the Pi dashboard server (arm64 and amd64).
#
# `main` deploys to Railway/Render from source, so this file exists only for
# the LAN/Docker path and is additive — it changes nothing about those.
#
#   docker compose up -d --build
#
# On boot the container runs `start:prod`, which applies Prisma migrations,
# seeds, then serves on 3000.

FROM node:22-slim AS base
# Prisma's query engine needs openssl; the slim image does not ship it.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Dev dependencies are required: `next build` needs typescript, tailwind and
# postcss. The prisma schema has to be in place before `npm ci`, because
# postinstall runs `prisma generate`.
FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --include=dev

FROM deps AS build
COPY . .
RUN npm run build

FROM base AS runtime
ENV NODE_ENV=production
ENV PORT=3000

# Reuse the resolved modules rather than reinstalling — a second npm ci on a
# Raspberry Pi costs several minutes.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY package.json package-lock.json next.config.mjs tsconfig.json ./
COPY prisma ./prisma
# start:prod seeds via `tsx prisma/seed.ts`, and that imports
# ../src/lib/crypto — so src must exist at runtime, not just at build time.
COPY src ./src

EXPOSE 3000
CMD ["npm", "run", "start:prod"]
