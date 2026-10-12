# Troubleshooting

문제 → 원인 → 해결 → 결과 형식으로 누적 기록합니다.

## 1. ts-jest 경고 TS151002 (Phase 1)

- **문제**: api 테스트 실행 시 `Using hybrid module kind (Node16/18/Next) is only supported in "isolatedModules: true"` 경고가 테스트 파일마다 출력됨.
- **원인**: api tsconfig를 `module: nodenext`로 설정. NestJS는 `emitDecoratorMetadata` 때문에 `isolatedModules`를 끌 수밖에 없는데, ts-jest는 이 조합을 지원하지 않는다.
- **해결**: api는 `module: commonjs` + `moduleResolution: bundler`로 변경. TS 6에서 `node10` 해석이 deprecated라 `bundler`를 사용한다.
- **결과**: 경고가 사라지고, 타입체크와 빌드 결과는 동일.

## 2. Vitest 설정 파일 ESM/CJS 경고 (Phase 1)

- **문제**: `packages/shared`에서 `ESM syntax in a file loaded as CommonJS (vitest.config.ts)` 경고.
- **원인**: shared는 api가 require할 수 있게 CommonJS 패키지(`type` 미지정)로 두었기 때문에 `.ts` 설정 파일이 CJS로 해석된다.
- **해결**: 설정 파일을 `vitest.config.mts`로 변경.
- **결과**: 경고 제거.

## 3. fractional indexing 순서가 DB 정렬과 다름 (Phase 2)

- **문제**: `generateKeyBetween`이 만든 키(`Zz` < `a0` < `a0V`)를 PostgreSQL에서 `ORDER BY position`으로 정렬하면, 대소문자가 섞인 키의 순서가 뒤바뀔 수 있다.
- **원인**: fractional indexing은 **코드 포인트(바이트) 순** 비교(`0-9 < A-Z < a-z`)를 전제로 한다. PostgreSQL 기본 collation(`en_US.UTF-8`)은 언어 규칙으로 정렬해 대소문자를 거의 같은 값으로 본다.
- **해결**:
  - 마이그레이션 SQL에서 `position` 컬럼을 `TEXT COLLATE "C"`로 만들었다. Prisma 스키마에는 collation 속성이 없지만 introspection에서 차이로 잡히지 않아 drift가 생기지 않는다.
  - 애플리케이션에서도 `sortByPosition()`(코드 포인트 비교)으로 한 번 더 정렬해, DB 설정과 무관하게 결과가 같게 했다.
- **결과**: `prisma migrate dev`를 다시 실행해도 drift 없음. 정렬 결과가 shared 단위 테스트의 불변식과 일치한다.

## 4. 동시에 같은 위치로 카드를 넣으면 position이 중복됨 (Phase 5)

- **문제**: 두 사용자가 거의 동시에 서로 다른 카드를 같은 두 카드 사이로 옮기면, 두 카드의 `position`이 같아져 순서가 불안정해진다(새로고침할 때마다 순서가 바뀜).
- **원인**:
  - 두 요청이 각자 같은 이웃(`lo`, `hi`)을 읽고 `generateKeyBetween(lo, hi)`를 계산한다. 결정적 함수라 같은 키가 나온다.
  - 카드 행 단위의 낙관적 잠금(version)은 **서로 다른 카드**의 충돌을 막지 못한다.
- **해결**:
  - 모든 보드 쓰기를 `BoardWriter.write()`로 모았다. 트랜잭션 시작 시 `SELECT ... FROM "Board" WHERE id = $1 FOR UPDATE`로 보드 행을 잠근다.
  - 두 번째 요청은 첫 번째가 커밋된 뒤의 이웃을 읽으므로 항상 다른 키가 나온다.
  - seq도 잠금 안에서 발급해 이벤트 순서와 커밋 순서를 일치시켰다 (ADR 003).
- **결과**:
  - `concurrency.e2e-spec.ts`에서 8개 카드를 같은 위치로 동시에 옮겨도 position이 모두 고유하다.
  - 이벤트를 받은 클라이언트 상태가 DB 스냅샷과 같다.

## 5. 충돌 알림 후에도 내 (거절된) 수정 내용이 화면에 남음 (Phase 5)

- **문제**: Alice와 Bob이 같은 카드 설명을 동시에 편집했다. Bob이 늦게 저장하면 409 `VERSION_CONFLICT` 토스트는 뜨지만, 화면에는 서버가 거절한 Bob의 설명이 그대로 남았다. (Playwright 충돌 시나리오에서 발견)
- **원인**:
  - 낙관적 업데이트는 version을 올리지 않는다. Bob의 로컬 카드는 "Alice 이벤트로 받은 v2 + Bob의 미확정 설명" 상태였다.
  - 409 응답의 `current`(v2)를 `upsertCard()`로 반영하려 했지만, 리듀서는 **version이 더 클 때만** 덮어쓰므로 같은 v2를 무시했다.
- **해결**: `upsertCard(state, card, authoritative)` 옵션을 추가했다. 서버가 "이것이 현재 상태"라고 확정해 준 응답(409의 `current`)은 version이 같아도 덮어쓴다. 일반 브로드캐스트는 기존처럼 더 큰 version만 반영한다(멱등성 유지).
- **결과**:
  - E2E `conflict.spec.ts`에서 Bob 화면이 Alice의 설명으로 바뀐다.
  - shared 단위 테스트에 같은 version의 authoritative/non-authoritative 경우를 추가했다.

## 6. 스냅샷을 다시 받는 사이에 도착한 이벤트가 사라짐 (Phase 4)

- **문제**: 보드 화면에 다시 들어올 때 TanStack Query가 스냅샷을 다시 가져온다. 그 요청이 진행되는 동안 도착해 캐시에 적용한 이벤트가, 응답으로 캐시를 통째로 덮을 때 사라질 수 있었다.
- **원인**:
  - 스냅샷은 요청 시점의 seq(예: 10)를 기준으로 한다.
  - 응답 도착 전에 이미 적용한 seq 11 이벤트는 sequencer의 `lastSeq`에도 반영되어 있다. 그래서 다시 오지 않는다.
- **해결**: 최근 적용한 이벤트 200개를 `realtime-state.ts`에 보관한다. 새 스냅샷을 채택할 때(`adoptSnapshot`) 스냅샷 seq보다 큰 이벤트를 다시 적용한다. 리듀서가 version 기반으로 멱등이라 다시 적용해도 안전하다.
- **결과**: 스냅샷 재요청과 실시간 이벤트가 겹쳐도 상태가 유실되지 않는다.

## 7. 뷰어가 카드 상세를 열 수 없음 (Phase 6)

- **문제**: 뷰어로 접속하면 카드를 클릭해도 상세 모달이 열리지 않는다. Playwright에서는 `waiting for element to be ... enabled`에서 멈췄다.
- **원인**: dnd-kit `useSortable({ disabled: true })`가 돌려주는 `attributes`에 `aria-disabled="true"`가 들어 있다. 카드(`role="button"`) 전체가 비활성 버튼으로 노출되었다. 스크린 리더 사용자도 카드를 열 수 없는 접근성 문제였다.
- **해결**: 드래그 비활성 여부와 상관없이 카드에 `aria-disabled={undefined}`를 지정해 덮어쓴다. 드래그 가능 여부는 `listeners`와 sensor가 판단한다.
- **결과**: 뷰어도 카드 상세(읽기 전용)를 열 수 있다. E2E `reconnect.spec.ts`의 권한 시나리오가 통과한다.

## 8. `pnpm deploy` 산출물에서 Prisma CLI 실행 실패 (Phase 6)

- **문제**: Docker 빌드 중 `./node_modules/.bin/prisma generate`가 exit 127(command not found)로 실패했다.
- **원인**: `pnpm deploy --ignore-scripts`로 만든 독립 디렉터리에는 이 경로의 bin 링크가 없었다.
- **해결**: 실행 경로를 `node node_modules/prisma/build/index.js`로 직접 지정했다. 운영 환경에서도 `migrate deploy`가 필요해 `prisma`를 dependencies로 옮겼다. compose의 `migrate` 서비스도 같은 경로를 쓴다.
- **결과**: 단일 앱 이미지 빌드에 성공했다. 컨테이너 2대 + Nginx 구성에서 E2E가 전부 통과했다.
