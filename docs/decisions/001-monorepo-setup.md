# 001. 모노레포 구성과 핵심 버전 선택

- 상태: 채택
- 날짜: 2026-10-12
- 단계: Phase 1

## 배경

프론트엔드(React)와 백엔드(NestJS)가 소켓 이벤트 페이로드, API 응답 타입을 공유해야 한다.
타입이 어긋나면 실시간 동기화 버그로 바로 이어지기 때문에, 한 레포 안에서 타입을 단일 소스로 관리하고 싶다.
또 최신 메이저 버전들(TypeScript 7, NestJS 12, Prisma 8 RC)이 막 나온 시점이라 안정성과 최신성 사이에서 선택이 필요했다.

## 선택지

1. **패키지 매니저/구조**: pnpm workspace / npm workspaces / Turborepo·Nx
2. **TypeScript**: 7.0 (Go 기반 네이티브 컴파일러) / 6.0
3. **NestJS**: 12 (ESM 전용) / 11 (CommonJS)
4. **Prisma**: 8 RC / 7 (driver adapter 필수, 새 generator) / 6
5. **shared 패키지 소비 방식**: 양쪽 모두 빌드 산출물 / 양쪽 모두 소스 / api는 빌드 산출물 + web은 소스

## 결정

- **pnpm workspace** (Turborepo 없이). 앱이 2개라 태스크 캐시의 이점이 작고, `pnpm -r`의 토폴로지 순서 실행으로 충분하다.
- **TypeScript 6.0**. typescript-eslint가 `<6.1`까지만 지원해 TS 7에서는 린트가 동작하지 않는다.
- **NestJS 11**. NestJS 12는 ESM 전용이라 Jest + ts-jest 조합에서 ESM 실험 플래그가 필요하고, 생태계 예제도 대부분 11 기준이다.
- **Prisma 6**. 7부터 driver adapter와 새 generator로 바뀌어 NestJS(CJS)와의 통합에서 검증된 자료가 적다. 8은 아직 RC다.
- **shared**: api는 `dist`(CommonJS)를, web은 Vite alias + tsconfig `paths`로 **소스를 직접** 참조한다.
- **디자인 시스템**: shadcn/ui (Tailwind v4, new-york 스타일, neutral 테마).

## 이유

- 포트폴리오의 핵심은 동기화 로직이다. 툴체인 호환성 문제에 시간을 쓰지 않도록 "현재 생태계가 검증한 조합"을 골랐다.
- shared를 web에서 소스로 참조하면 빌드 없이 HMR로 타입 변경이 바로 반영된다. api는 Nest 빌드(tsc)의 rootDir 제약 때문에 빌드 산출물을 쓴다.
- shadcn/ui는 컴포넌트 소스를 레포에 복사하는 방식이라, 칸반 카드/드래그 UI처럼 세밀한 커스터마이징이 필요한 화면에 유리하다.

## 트레이드오프 / 후속 작업

- api 타입체크와 실행 전에 `@kanban/shared` 빌드가 필요하다 (`pnpm dev`와 `pnpm typecheck`가 자동으로 처리).
- TS 7, NestJS 12, Prisma 7 이상으로의 업그레이드는 MVP 배포 이후에 검토한다.
