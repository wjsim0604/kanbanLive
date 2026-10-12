# syntax=docker/dockerfile:1
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/api/prisma apps/api/prisma
RUN pnpm install --frozen-lockfile --filter @kanban/api...
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @kanban/shared build && pnpm --filter @kanban/api build
# 운영 의존성만 담은 독립 디렉터리 생성 (prisma CLI는 devDependency라 생성 스크립트는 직접 실행)
RUN pnpm --filter @kanban/api deploy --prod --legacy --ignore-scripts /out \
  && cd /out && npx --yes prisma@6.19.3 generate --schema prisma/schema.prisma

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out .
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
