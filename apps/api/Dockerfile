# RustSkinPay API — production image.
#
# Build context is the monorepo root so pnpm workspace links resolve:
#   docker build -f apps/api/Dockerfile -t rustskinpay-api .
#
# Runtime model: we ship the TS source and run it through tsx (esbuild-backed
# TS loader). This sidesteps a build step for the workspace packages
# (@rustskinpay/db, @rustskinpay/shared) which export .ts source directly. The
# cold-start cost is ~200ms; for a long-running container this is irrelevant.
# Render / Railway / Fly all support this layout.

ARG NODE_VERSION=22-alpine

# ---------- deps ----------
FROM node:${NODE_VERSION} AS deps
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /app

# Copy workspace manifests first so layer caching skips reinstall when only
# source changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/worker/package.json ./apps/worker/
COPY apps/web/package.json ./apps/web/
COPY packages/db/package.json ./packages/db/
COPY packages/shared/package.json ./packages/shared/

# Honour pnpm's onlyBuiltDependencies (Prisma engines, msgpackr, etc.) and
# install everything including dev deps — tsx is in deps so this is small.
RUN pnpm install --frozen-lockfile --prod=false

# ---------- runtime ----------
FROM node:${NODE_VERSION} AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

# Pull workspace metadata + installed node_modules from the deps stage.
COPY --from=deps /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml /app/tsconfig.base.json ./
COPY --from=deps /app/node_modules ./node_modules

# Workspace packages — symlinked into node_modules by pnpm, so we ship their
# source + their package.json so the symlinks resolve at runtime.
COPY packages/db ./packages/db
COPY packages/shared ./packages/shared

# Prisma client needs to be generated against the schema. This is offline
# (no DB connection required) but must happen after the schema is in place.
RUN pnpm --filter @rustskinpay/db exec prisma generate

# API source.
COPY apps/api ./apps/api

# Non-root user (node:alpine ships one).
USER node

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:${PORT}/health || exit 1

WORKDIR /app/apps/api
CMD ["pnpm", "start"]
