# 009. 보안 강화: 인증 요청 제한, 타이밍 균일화, 보안 헤더, 소켓 토큰 만료

- 상태: 채택
- 날짜: 2026-11-02
- 단계: Phase 8 이후 보안 점검

## 배경

보안 점검(`pnpm audit`와 코드 리뷰)에서 다음 문제를 직접 재현했다.

| 문제                                    | 재현 결과                                                           |
| --------------------------------------- | ------------------------------------------------------------------- |
| 로그인 응답 시간으로 가입 여부가 드러남 | 가입된 이메일 99.8ms, 없는 이메일 4.6ms                             |
| 로그인 시도 횟수 제한 없음              | 30회 연속 실패가 모두 처리됨 (무차별 대입 가능)                     |
| 보안 헤더 없음                          | CSP·클릭재킹 방지 헤더 없음, `X-Powered-By: Express` 노출           |
| 소켓은 handshake에서만 토큰을 검사      | 로그아웃·토큰 만료 후에도 연결이 무기한 유지되어 이벤트를 계속 수신 |
| JWT 검증 알고리즘 미지정                | 라이브러리 기본값에 의존 (알고리즘 혼동 공격 여지)                  |
| 운영 의존성 취약점                      | body-parser, multer, deepmerge-ts (High), qs, js-yaml (Moderate)    |

권한(IDOR), SQL 주입, XSS, 쿠키 속성, CSRF는 점검 결과 문제가 없었다.

- 모든 쓰기는 서비스 계층에서 매번 DB로 역할을 확인한다.
- raw 쿼리는 모두 파라미터 바인딩을 쓴다.
- React가 출력을 이스케이프하고 `innerHTML`을 쓰지 않는다.
- refresh 쿠키는 `httpOnly; SameSite=Lax; Path=/api/auth`이다.

## 결정

1. **인증 요청 제한** (`@nestjs/throttler`, `AuthThrottlerGuard`, login·signup·refresh)
   - `account`: 같은 IP와 같은 이메일로 1분 10회(`AUTH_RATE_LIMIT_PER_ACCOUNT`). 이메일은 소문자로 정규화한다.
   - `ip`: 같은 IP로 1분 100회(`AUTH_RATE_LIMIT_PER_IP`). 이메일을 바꿔 가며 시도하거나 계정을 대량 생성하는 것을 막는다.
   - refresh는 이메일이 없어 `ip` 제한만 적용한다. 같은 IP를 쓰는 사무실(NAT)에서 정상 사용자가 막히지 않게 하기 위해서다.
   - 429 응답에 표준 `Retry-After` 헤더를 붙인다.
   - 프록시 뒤에서 실제 클라이언트 IP를 쓰도록 `trust proxy`를 설정한다(운영 기본 1단, `TRUST_PROXY`). 프록시 없이 신뢰하면 `X-Forwarded-For` 위조로 우회할 수 있어 개발 환경에서는 끈다.
2. **로그인 타이밍 균일화**: 없는 계정이어도 더미 해시와 bcrypt 비교를 수행한다(`verifyAgainstDummy`).
3. **보안 헤더** (`helmet`)
   - CSP: `script-src 'self'`(인라인 스크립트 금지), `connect-src 'self'`(REST·wss 같은 오리진), `frame-ancestors 'none'`
   - `style-src`는 Radix/sonner의 style 속성 때문에 `'unsafe-inline'`을 허용한다.
   - HSTS는 운영(HTTPS)에서만 보낸다. `X-Powered-By`는 제거한다.
   - SPA, Swagger UI, 같은 오리진 WebSocket이 CSP 위반 0건으로 동작하는 것을 브라우저로 확인했다.
4. **JWT 알고리즘 고정**: 서명과 검증 모두 `HS256`만 허용한다. `alg: none`과 HS512 토큰이 거부되는 것을 테스트로 고정했다.
5. **소켓 토큰 만료**
   - access token의 `exp`에 맞춰 서버가 소켓을 끊는다.
   - 클라이언트는 `io server disconnect`에서 재접속하고, 토큰이 만료됐으면 refresh 후 다시 붙는다. 끊긴 동안의 이벤트는 sync로 복구한다.
   - 그래서 로그아웃이나 권한 회수 후 최대 15분(access token 수명) 안에 실시간 수신이 끝난다.
6. **기타**
   - `SWAGGER_ENABLED`: 운영 기본 비공개. 포트폴리오 데모라 `fly.toml`에서는 명시적으로 켰다.
   - `X-Request-Id`: 형식(`[A-Za-z0-9._-]{1,64}`)이 맞을 때만 이어 쓴다.
   - 운영 의존성은 `pnpm-workspace.yaml`의 `overrides`로 패치 버전에 고정했다.

## 트레이드오프 / 남은 과제

- 요청 제한 카운터는 인스턴스 메모리에 있다. api를 N대 운영하면 실효 한도가 최대 N배다. 엄격히 하려면 Redis 저장소(`ThrottlerStorage` 구현)로 옮긴다.
- 여러 IP에서 분산 시도하는 공격은 계정 단위 전역 잠금이나 CAPTCHA가 필요하다. 현재 범위 밖이다.
- 소켓 이벤트(쓰기) 자체에는 요청 제한이 없다. 쓰기는 보드별 대기열로 직렬화되어 다른 보드에 주는 영향은 제한적이다(ADR 007).
- 개발·테스트 도구 의존성(jsdom의 undici, Nest CLI 등)에 취약점 18건이 남아 있다. 운영 이미지에는 포함되지 않는다(`pnpm audit --prod` 0건).
- 데모 계정 비밀번호는 공개되어 있다. 데모 보드는 누구나 수정할 수 있으며, `SEED_RESET=true`로 다시 만들 수 있다.
