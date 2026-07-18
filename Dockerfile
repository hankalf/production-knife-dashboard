# Safety Knife Checkout — production image for Docker Desktop / any host.
# Runs `start:prod` (prisma migrate deploy -> seed -> next start) on boot.
FROM node:22-bookworm-slim AS base
# Prisma needs OpenSSL at build and runtime.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# --- Install dependencies ---
FROM base AS deps
COPY package.json package-lock.json ./
# prisma/ must be present because the postinstall script runs `prisma generate`.
COPY prisma ./prisma
RUN npm ci

# --- Build ---
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# A dummy URL just satisfies Prisma client generation / Next build; no DB is
# contacted during the build (all pages are dynamic).
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
RUN npm run build

# --- Runtime ---
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
# Copy the built app. node_modules includes the Prisma CLI and tsx, which
# start:prod uses to migrate and seed; prisma/ and src/ are needed by the seed.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/next.config.mjs ./next.config.mjs
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/src ./src
COPY --from=build /app/tsconfig.json ./tsconfig.json

EXPOSE 3000
CMD ["npm", "run", "start:prod"]
