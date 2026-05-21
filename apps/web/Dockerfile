# RustSkinPay web — production image.
#
# Build from the monorepo root:
#   docker build -f apps/web/Dockerfile -t rustskinpay-web .
#
# Next.js bakes NEXT_PUBLIC_* vars at build time, so they're passed in as
# build args. The CHECKOUT_DISABLED flag and API URL are hardcoded to prod
# values; toggling them requires a rebuild (handled by the deploy workflow).

ARG NODE_VERSION=22-alpine

FROM node:${NODE_VERSION}

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /app

ENV NODE_ENV=production

ARG NEXT_PUBLIC_API_URL=https://api.rustsupply.com
ARG NEXT_PUBLIC_CHECKOUT_DISABLED=true
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_CHECKOUT_DISABLED=$NEXT_PUBLIC_CHECKOUT_DISABLED

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/worker/package.json ./apps/worker/
COPY apps/web/package.json ./apps/web/
COPY packages/db/package.json ./packages/db/
COPY packages/shared/package.json ./packages/shared/

RUN pnpm install --frozen-lockfile --prod=false

# Web needs @rustskinpay/shared at build + runtime.
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web

RUN pnpm --filter @rustskinpay/web build

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:3000/ || exit 1

WORKDIR /app/apps/web
CMD ["pnpm", "start"]
