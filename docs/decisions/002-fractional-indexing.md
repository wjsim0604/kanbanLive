# 002. 카드/리스트 순서: 문자열 fractional indexing + 서버 확정

- 상태: 채택
- 날짜: 2026-10-12
- 단계: Phase 2

## 배경

카드를 옮길 때마다 리스트의 다른 카드 순서 값을 다시 쓰면 쓰기 양이 많아진다.
여러 사용자가 동시에 옮길 때는 서로의 변경을 덮어쓰기도 쉽다. 이동 1번에 행 1개만 갱신하는 순서 표현이 필요했다.

## 선택지

1. **정수 인덱스**(0, 1, 2…): 단순하지만 중간 삽입 시 뒤쪽 전체를 다시 써야 한다.
2. **실수(float) position**: 중간값 (a+b)/2를 쓴다. 50여 번 반복하면 배정밀도 한계에 닿아 충돌이 난다.
3. **문자열 fractional indexing**: base62 문자열을 사전순으로 비교한다. 길이 제한이 없어 사실상 무한히 끼워 넣을 수 있다.
4. **연결 리스트(prev/next 포인터)**: 조회 시 정렬 비용이 크고, 동시 수정 시 사이클이 생길 수 있다.

## 결정

- **문자열 fractional indexing**을 쓴다. rocicorp `fractional-indexing`(CC0) 알고리즘을 `packages/shared/src/position.ts`로 포팅했다.
- 최종 `position`은 **항상 서버가 계산한다.** 클라이언트는 `beforeCardId/afterCardId` hint만 보낸다.
  - `planInsert()`는 hint 중 하나(before 우선)만 기준으로 삼고, 반대쪽 이웃은 **서버의 실제 순서**에서 다시 구한다.
  - 클라이언트 화면이 오래되었어도 항상 `lo < 새 키 < hi`가 보장된다.
- 키 길이가 32자를 넘으면 해당 리스트 전체를 균등 간격으로 다시 매긴다(rebalance). 결과는 `positions:rebalanced` 이벤트로 알린다.
- DB 컬럼은 `COLLATE "C"`로 만든다 (→ troubleshooting #3).

## 이유

- 이동 1번에 UPDATE 1건이라 잠금 범위와 이벤트 크기가 작다.
- 같은 `planInsert()`를 웹에서도 써서 낙관적 업데이트 위치를 계산하므로, 서버 결과와 대부분 일치한다.
- 원본 패키지는 ESM 전용이라 CommonJS인 NestJS와 Jest에서 직접 쓸 수 없었다. 대신 포팅하면서 원본과 같은 값이 나오는지 테스트로 고정했다.
