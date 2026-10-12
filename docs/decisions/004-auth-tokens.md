# 004. 인증: 메모리 access token + httpOnly 쿠키 refresh token(회전)

- 상태: 채택
- 날짜: 2026-10-12
- 단계: Phase 2

## 배경

SPA와 WebSocket을 함께 쓰므로 REST 헤더와 소켓 handshake 양쪽에서 같은 토큰을 쓸 수 있어야 한다.
동시에 XSS로 장기 토큰이 탈취되는 위험은 줄여야 한다.

## 선택지

1. 세션 쿠키 + 서버 세션 저장소
2. access/refresh 모두 localStorage
3. **access token은 응답 본문 → 메모리, refresh token은 httpOnly 쿠키**

## 결정

- access token: JWT, 15분, `Authorization: Bearer`로 보낸다. 소켓은 `auth.token`으로 보낸다.
- refresh token: 무작위 32바이트이고 DB에는 SHA-256 해시만 저장한다.
  - 쿠키 속성: `httpOnly; SameSite=Lax; Path=/api/auth`
- `/auth/refresh`를 호출할 때마다 refresh token을 **회전**한다. 이미 폐기된 토큰이 다시 오면 탈취로 보고 해당 사용자의 모든 refresh token을 폐기한다.
- 비밀번호 해시는 bcryptjs를 쓴다. 순수 JS라 alpine/arm 이미지에서 네이티브 빌드가 필요 없다.

## 이유

- 장기 토큰이 JS에서 보이지 않으므로 XSS 피해가 15분짜리 access token으로 제한된다.
- 쿠키 Path를 `/api/auth`로 좁혀서 다른 API 요청에는 refresh token이 실리지 않는다.
- 소켓 인증도 같은 access token을 써서 인증 경로가 하나로 유지된다.
