# 배포 가이드 (Fly.io)

api(NestJS)가 web 빌드 결과물을 같은 오리진에서 서빙하는 **단일 Docker 이미지**(`/Dockerfile`)를 Fly.io에 배포합니다.
PostgreSQL과 Redis는 Fly 관리형 서비스를 연결합니다.

```
브라우저 ──HTTPS/WSS──▶ Fly Proxy ──▶ app 머신 N대 (api + web 정적 파일)
                                         ├─▶ PostgreSQL (Fly Postgres)
                                         └─▶ Redis (Upstash, Socket.IO adapter + seq + 이벤트 로그)
```

## 1. 최초 1회 설정

```bash
# flyctl 설치 후 로그인
fly auth login

# 앱 생성 (fly.toml은 레포에 있으므로 배포하지 않고 생성만)
fly launch --no-deploy --copy-config --name kanban-live

# PostgreSQL 생성 후 연결 → DATABASE_URL 시크릿이 자동 등록됨
fly postgres create --name kanban-live-db --region nrt
fly postgres attach kanban-live-db

# Redis(Upstash) 생성 → 출력된 redis:// URL을 시크릿으로 등록
fly redis create --name kanban-live-redis --region nrt
fly secrets set REDIS_URL='redis://default:<password>@<host>:6379'

# 앱 시크릿
fly secrets set \
  JWT_ACCESS_SECRET="$(openssl rand -base64 48)" \
  WEB_ORIGIN='https://kanban-live.fly.dev'
# (선택) 에러 추적
fly secrets set SENTRY_DSN='https://...@sentry.io/...'
```

## 2. 배포

```bash
fly deploy
```

- `release_command`(`apps/api/scripts/release.sh`)는 새 버전이 뜨기 전에 한 번 실행됩니다. 하는 일은 다음과 같습니다.
  - `prisma migrate deploy`로 마이그레이션을 적용합니다.
  - `SEED_DEMO=true`이면 데모 데이터를 넣습니다(멱등이라 이미 있으면 건너뜀).
- 헬스체크: `GET /api/health` (DB와 Redis가 모두 up일 때 200)
- 머신을 2대 이상으로 늘리려면 `fly scale count 2`를 실행합니다. Redis adapter가 있어 인스턴스가 달라도 동기화됩니다.

## 3. GitHub Actions 자동 배포

`main`에 병합되면 CI(`check`, `api-e2e`, `e2e`)가 모두 통과한 뒤 `deploy` 작업이 실행됩니다.

```bash
fly tokens create deploy -x 999999h   # 출력된 토큰을
# GitHub → Settings → Secrets and variables → Actions → New secret
#   Name: FLY_API_TOKEN
```

시크릿이 없으면 deploy 작업은 안내 메시지만 남기고 건너뜁니다.

## 4. 데모 계정

| 이메일            | 비밀번호 | 역할   |
| ----------------- | -------- | ------ |
| demo@kanban.live  | demo1234 | 소유자 |
| jiwoo@kanban.live | demo1234 | 편집자 |
| minho@kanban.live | demo1234 | 뷰어   |

로그인 화면의 **"데모 계정으로 둘러보기"** 버튼은 `demo@kanban.live`로 로그인합니다.
브라우저 두 개로 각각 다른 데모 계정에 로그인하면 실시간 동기화와 접속자 표시를 바로 볼 수 있습니다.

## 환경 변수

| 변수                                              | 필수      | 설명                                                                   |
| ------------------------------------------------- | --------- | ---------------------------------------------------------------------- |
| `DATABASE_URL`                                    | ✅        | PostgreSQL 연결 문자열                                                 |
| `REDIS_URL`                                       | ✅        | Redis 연결 문자열                                                      |
| `JWT_ACCESS_SECRET`                               | ✅ (운영) | access token 서명 키. 운영에서 없으면 기동 실패                        |
| `WEB_ORIGIN`                                      |           | CORS 허용 오리진 (같은 오리진 서빙이면 배포 URL)                       |
| `WEB_DIST_DIR`                                    |           | 설정 시 web 빌드 결과물 서빙 (이미지에서 `/app/web`)                   |
| `SEED_DEMO`                                       |           | `true`면 release 시 데모 데이터 시드                                   |
| `LOG_LEVEL`                                       |           | pino 로그 레벨 (기본 운영 `info`)                                      |
| `SENTRY_DSN`                                      |           | 설정 시 5xx 에러를 Sentry로 전송                                       |
| `BOARD_WRITE_CONCURRENCY`                         |           | 인스턴스 내 보드별 동시 쓰기 트랜잭션 수 (기본 2, docs/performance.md) |
| `ACCESS_TOKEN_TTL_SEC` / `REFRESH_TOKEN_TTL_DAYS` |           | 토큰 수명 (기본 900초 / 14일)                                          |
