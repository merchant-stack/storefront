# RustSkinPay worker — production image.
#
# Build from the monorepo root:
#   docker build -f apps/worker/Dockerfile -t rustskinpay-worker .
#
# Same runtime model as the api: ship TS source + run via tsx. Worker exposes
# :4001 for health/metrics scraping only; BullMQ jobs flow over Redis.

ARG NODE_VERSION=22-alpine

# ---------- deps ----------
FROM node:${NODE_VERSION} AS deps
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/worker/package.json ./apps/worker/
COPY apps/web/package.json ./apps/web/
COPY packages/db/package.json ./packages/db/
COPY packages/shared/package.json ./packages/shared/

RUN pnpm install --frozen-lockfile --prod=false

# ---------- runtime ----------
FROM node:${NODE_VERSION} AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV WORKER_HEALTH_PORT=4001

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

COPY --from=deps /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml /app/tsconfig.base.json ./
COPY --from=deps /app/node_modules ./node_modules

COPY packages/db ./packages/db
COPY packages/shared ./packages/shared

RUN DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder \
    pnpm --filter @rustskinpay/db exec prisma generate

COPY apps/worker ./apps/worker

USER node

EXPOSE 4001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:${WORKER_HEALTH_PORT}/health || exit 1

WORKDIR /app/apps/worker
CMD ["pnpm", "start"]
