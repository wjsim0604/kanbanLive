# 기술 결정 기록 (ADR)

"배경 → 선택지 → 결정 → 이유" 형식으로 주요 기술 결정을 기록합니다.

| #                                         | 제목                                                                        | 단계    |
| ----------------------------------------- | --------------------------------------------------------------------------- | ------- |
| [001](./001-monorepo-setup.md)            | 모노레포 구성과 핵심 버전 선택 (pnpm, TS 6, NestJS 11, Prisma 6, shadcn/ui) | Phase 1 |
| [002](./002-fractional-indexing.md)       | 카드/리스트 순서: 문자열 fractional indexing + 서버 확정                    | Phase 2 |
| [003](./003-board-write-serialization.md) | 보드 단위 쓰기 직렬화와 seq 발급 위치                                       | Phase 2 |
| [004](./004-auth-tokens.md)               | 인증: 메모리 access token + httpOnly 쿠키 refresh token(회전)               | Phase 2 |
| [005](./005-socketio-event-envelope.md)   | Socket.IO + 단일 `board:event` 봉투 + REST 쓰기                             | Phase 4 |
| [006](./006-reconnect-and-scale-out.md)   | 재연결 복구(seq + Redis 이벤트 로그)와 Redis adapter 수평 확장              | Phase 6 |
| [007](./007-board-write-queue.md)         | 인스턴스 내 보드별 쓰기 대기열 (KeyedSemaphore)                             | Phase 7 |
| [008](./008-single-image-deployment.md)   | 단일 이미지 배포 (api가 web 서빙) + Fly.io                                  | Phase 7 |
