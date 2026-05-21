# RustSkinPay API — production image.
#
# Build from the monorepo root so pnpm workspace links resolve:
#   docker build -f apps/api/Dockerfile -t rustskinpay-api .
#
# Runtime model: ship the TS source and run via tsx. Single stage keeps the
# pnpm workspace's nested node_modules intact (multi-stage COPY of the root
# node_modules alone loses packages/db/node_modules/.bin/prisma).

ARG NODE_VERSION=22-alpine

FROM node:${NODE_VERSION}

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

# Workspace manifests first — layer cache hits when only source changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/worker/package.json ./apps/worker/
COPY apps/web/package.json ./apps/web/
COPY packages/db/package.json ./packages/db/
COPY packages/shared/package.json ./packages/shared/

# All deps including dev (tsx + prisma needed at runtime / generate time).
RUN pnpm install --frozen-lockfile --prod=false

# Workspace package sources.
COPY packages/db ./packages/db
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api

# Generate the Prisma client. Schema's runtime adapter asserts DATABASE_URL
# even during generate, so feed a placeholder (no DB connection happens).
RUN DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder \
    pnpm --filter @rustskinpay/db exec prisma generate

USER node

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:${PORT}/health || exit 1

WORKDIR /app/apps/api
CMD ["pnpm", "start"]
