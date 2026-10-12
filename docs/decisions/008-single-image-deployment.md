# 008. 단일 이미지 배포 (api가 web 서빙) + Fly.io

- 상태: 채택
- 날짜: 2026-10-12
- 단계: Phase 7

## 배경

web(SPA)과 api(REST + WebSocket)를 배포해야 한다. 포트폴리오 특성상 운영 비용과 구성 복잡도는 낮게, 데모 URL은 항상 동작하게 하고 싶다.

## 선택지

1. web을 정적 호스팅(Vercel 등)에, api를 별도 서버에: 오리진이 달라 CORS, 쿠키(`SameSite=None; Secure`), WebSocket 오리진 설정이 모두 필요하다.
2. web 컨테이너(Nginx) + api 컨테이너: 서비스 2개를 운영해야 한다.
3. **api가 web 빌드 결과물을 같은 오리진에서 서빙하는 단일 이미지**

배포 대상: Render(무료 인스턴스 슬립, WebSocket 지원), **Fly.io**(WebSocket, 다중 머신, release_command, 관리형 Postgres/Upstash Redis)

## 결정

- 루트 `Dockerfile`로 shared, api, web을 빌드한다. 런타임 이미지에는 `pnpm deploy --prod` 결과(운영 의존성)와 web `dist`만 담는다.
- api는 `WEB_DIST_DIR`이 설정되면 정적 파일과 SPA fallback을 서빙한다. `/api`, `/socket.io`, `/docs`는 제외한다.
- Fly.io `release_command`에서 마이그레이션과 데모 시드를 실행한다. `main` 병합 시 CI가 통과하면 자동 배포한다(`FLY_API_TOKEN`이 있을 때만).
- 로컬 확장 검증은 `docker-compose.scale.yml`(같은 이미지 2대 + Nginx)로 한다.

## 이유

- 같은 오리진이라 refresh 쿠키를 `SameSite=Lax`로 둘 수 있고 CORS 설정이 필요 없다.
- 이미지 하나라 로컬 compose, CI E2E, 운영이 같은 산출물을 쓴다. CI E2E도 api가 web을 서빙하는 운영과 같은 형태로 돈다.
- Socket.IO 클라이언트를 websocket 전송만 쓰도록 해 sticky session 없이 머신을 늘릴 수 있다.
