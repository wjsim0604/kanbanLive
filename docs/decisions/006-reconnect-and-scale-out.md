# 006. 재연결 복구(seq + Redis 이벤트 로그)와 Redis adapter 수평 확장

- 상태: 채택
- 날짜: 2026-10-12
- 단계: Phase 6

## 배경

- 모바일 네트워크 전환이나 노트북 절전처럼 연결이 잠시 끊기는 일은 흔하다. 다시 연결된 클라이언트는 그동안의 변경을 빠짐없이, 순서대로 받아야 한다.
- api를 여러 대로 늘리면, A 서버에서 커밋된 변경을 B 서버에 붙은 클라이언트도 받아야 한다.

## 선택지

**재연결 복구**

1. 재연결할 때마다 전체 스냅샷을 다시 받는다. 단순하지만 보드가 크면 비싸고, 화면이 깜빡인다.
2. **seq 기반 증분 복구 + 범위 밖이면 스냅샷**
3. 클라이언트별 미전달 큐를 서버에 둔다. 연결 상태를 서버가 관리해야 해서 메모리가 많이 들고 다중 서버에서 복잡하다.

**이벤트 로그 저장소**

- Redis List: 단순하지만 커밋 순서와 발행 순서가 어긋나면 순서가 뒤섞인다.
- Redis Stream: ID가 시간 기반이라 seq와 별개로 관리해야 한다.
- **Redis Sorted Set(score = seq)**: seq 범위 조회(`ZRANGEBYSCORE (lastSeq +inf`)와 개수 제한(`ZREMRANGEBYRANK`)이 간단하다.

**다중 서버 브로드캐스트**

- **Socket.IO Redis adapter**(Pub/Sub): `server.to(room).emit`, `fetchSockets`가 클러스터 전체에 적용된다.
- 직접 Pub/Sub을 구독해 재발행: adapter가 해 주는 일을 다시 구현하게 된다.

## 결정

- 클라이언트는 `EventSequencer`로 마지막 처리 seq를 관리한다. `connect` 이벤트마다 `board:join` → `sync { boardId, lastSeq }`를 보낸다.
- 서버는 보드별 최근 500개 이벤트를 Sorted Set에 보관한다.
  - `lastSeq` 이후가 로그 범위 안이면 이벤트만 돌려준다.
  - 범위를 벗어났거나 seq가 초기화되었으면(`lastSeq > current`) 전체 스냅샷을 돌려준다.
- 이벤트 수신 중 seq 공백을 발견하면 800ms 동안 순서가 바뀐 이벤트를 기다린 뒤 sync를 요청한다. 롤백으로 생긴 빈 번호는 `advanceTo(seq)`로 건너뛴다.
- `@socket.io/redis-adapter`를 `AppIoAdapter`에서 연결한다. seq는 Redis `INCRBY`로 발급하므로 인스턴스와 무관하게 단조 증가한다.
- 클라이언트는 `transports: ['websocket']`만 쓴다. 그래서 로드밸런서에 sticky session이 필요 없다(Nginx 라운드로빈).
- 권한 변경은 즉시 반영한다.
  - `member:removed`: 해당 사용자의 소켓을 룸에서 내보낸다.
  - `member:updated`(내 역할): 클라이언트 캐시의 role을 바꿔 UI 권한을 즉시 전환한다.

## 검증

- `apps/api/test/multi-instance.e2e-spec.ts`: 한 프로세스 안에 Nest 앱 2개를 띄워, 서버 간 이벤트·presence·seq 단조성을 확인한다.
- `e2e/tests/multi-server.spec.ts`: 브라우저 2개를 서로 다른 인스턴스에 연결한다. CI에서는 api 2개를 띄운다.
- `e2e/tests/reconnect.spec.ts`: `context.setOffline(true)`로 끊긴 동안의 변경(생성/이동/리스트 이름 변경)이 재연결 후 반영되는지 확인한다.
- 로컬: `docker-compose.scale.yml`(app1, app2, Nginx)에서 `/api/health`의 `instance`가 번갈아 응답하는 것과 E2E 전체 통과를 확인했다.
