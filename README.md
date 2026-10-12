# Kanban Live

여러 사용자가 같은 보드를 동시에 보고 편집하는 **실시간 협업 칸반보드**입니다.
기능 수보다 동기화 문제(동시 이동 충돌, 낙관적 업데이트, 재연결 복구, 다중 서버 확장)를 어떻게 풀었는지를 보여주는 것이 목표입니다.

> 현재 진행 단계: **Phase 1 — 프로젝트 세팅** (헬스체크 API + 첫 화면)

## 기술 스택

| 영역       | 스택                                                                   |
| ---------- | ---------------------------------------------------------------------- |
| 프론트엔드 | React 19, TypeScript, Vite 8, Tailwind CSS v4, shadcn/ui               |
| 백엔드     | NestJS 11, Prisma 6, PostgreSQL 16                                     |
| 인프라     | Redis 7, Docker / docker-compose, GitHub Actions                       |
| 품질       | TypeScript strict, ESLint 9 + Prettier, Jest(api), Vitest(web, shared) |

## 구조

```
apps/
  api/        NestJS API (Prisma, /health)
  web/        React + Vite + shadcn/ui
packages/
  shared/     api·web 공유 타입 (이벤트 페이로드, 응답 타입)
docs/
  decisions/  ADR (기술 결정 기록)
```

## 로컬 실행

### 사전 준비

- Node.js 22 (`.nvmrc`), pnpm 10 (`corepack enable`)
- Docker (PostgreSQL, Redis 실행용)

### 1) 의존성 설치 + 환경 변수

```bash
corepack enable
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

### 2) PostgreSQL · Redis 실행

```bash
docker compose up -d        # postgres:5432, redis:6379
```

### 3) 개발 서버 실행

```bash
pnpm dev                    # api → http://localhost:3000, web → http://localhost:5173
curl localhost:3000/health  # {"status":"ok","db":"up",...}
```

DB가 내려가 있으면 `/health`는 **503**과 `{"status":"error","db":"down"}`을 반환하고, 웹 첫 화면의 서버 상태 배지도 빨간색으로 바뀝니다.

### 전체를 컨테이너로 실행

```bash
docker compose --profile app up --build
# api → http://localhost:3000/health, web → http://localhost:8080
```

## 스크립트

| 명령                                 | 설명                                         |
| ------------------------------------ | -------------------------------------------- |
| `pnpm dev`                           | shared 빌드 후 api·web 개발 서버 동시 실행   |
| `pnpm lint`                          | ESLint                                       |
| `pnpm format`                        | Prettier 포맷 적용 (`format:check`는 검사만) |
| `pnpm typecheck`                     | 전체 타입체크                                |
| `pnpm test`                          | 단위 테스트 (shared, api, web)               |
| `pnpm build`                         | 전체 빌드                                    |
| `pnpm --filter @kanban/api test:e2e` | 실제 PostgreSQL 대상 API 통합 테스트         |

## shadcn/ui 컴포넌트 추가

```bash
cd apps/web
pnpm dlx shadcn@latest add dialog input
```

컴포넌트는 `apps/web/src/components/ui`에 생성됩니다 (설정: `apps/web/components.json`).

## CI

GitHub Actions(`.github/workflows/ci.yml`)에서 PR과 main 푸시마다 다음을 실행합니다.

- 포맷 검사 → 린트 → 타입체크 → 단위 테스트 → 빌드
- PostgreSQL 서비스 컨테이너를 띄워 API e2e 테스트

## 문서

- [`CLAUDE.md`](./CLAUDE.md) — 프로젝트 명세와 개발 규칙
- [`docs/decisions/`](./docs/decisions) — 기술 결정 기록(ADR)
- [`docs/troubleshooting.md`](./docs/troubleshooting.md) — 문제 해결 기록
