# syntax=docker/dockerfile:1
# 단일 앱 이미지: api(NestJS)가 web(Vite 빌드 결과물)을 같은 오리진에서 서빙한다.

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/api/prisma apps/api/prisma
COPY apps/web/package.json apps/web/
COPY e2e/package.json e2e/
RUN pnpm install --frozen-lockfile --filter @kanban/api... --filter @kanban/web...
COPY packages/shared packages/shared
COPY apps/api apps/api
COPY apps/web apps/web
RUN pnpm --filter @kanban/shared build \
  && pnpm --filter @kanban/api build \
  && pnpm --filter @kanban/web build
# 운영 의존성만 담은 독립 디렉터리 (Prisma Client는 직접 생성)
RUN pnpm --filter @kanban/api deploy --prod --legacy --ignore-scripts /out \
  && cd /out && node node_modules/prisma/build/index.js generate

FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    WEB_DIST_DIR=/app/web
WORKDIR /app
COPY --from=build --chown=node:node /out .
COPY --from=build --chown=node:node /repo/apps/web/dist ./web
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s \
  CMD wget -qO- http://localhost:3000/api/health || exit 1
CMD ["node", "dist/main.js"]
