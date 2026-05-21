# RustSkinPay worker — production image.
#
# Build from the monorepo root:
#   docker build -f apps/worker/Dockerfile -t rustskinpay-worker .
#
# Single stage (same reason as api Dockerfile — nested workspace node_modules
# don't survive a multi-stage root-only COPY).

ARG NODE_VERSION=22-alpine

FROM node:${NODE_VERSION}

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /app

ENV NODE_ENV=production
ENV WORKER_HEALTH_PORT=4001

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/worker/package.json ./apps/worker/
COPY apps/web/package.json ./apps/web/
COPY packages/db/package.json ./packages/db/
COPY packages/shared/package.json ./packages/shared/

RUN pnpm install --frozen-lockfile --prod=false

COPY packages/db ./packages/db
COPY packages/shared ./packages/shared
COPY apps/worker ./apps/worker

RUN DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder \
    pnpm --filter @rustskinpay/db exec prisma generate

USER node

EXPOSE 4001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:${WORKER_HEALTH_PORT}/health || exit 1

WORKDIR /app/apps/worker
CMD ["pnpm", "start"]
