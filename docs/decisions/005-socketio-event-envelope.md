# 005. Socket.IO + 단일 `board:event` 봉투 + REST 쓰기

- 상태: 채택
- 날짜: 2026-10-12
- 단계: Phase 4

## 배경

보드 변경을 같은 보드의 모든 접속자에게 즉시 전달해야 한다. 또 재연결 시 누락분을 복구할 수 있어야 한다.

## 선택지

| | 장점 | 단점 |
|---|---|---|
| 순수 WebSocket(ws) | 가볍다 | 룸, 재연결, ack, 다중 서버 브로드캐스트를 직접 구현해야 한다 |
| SSE | HTTP 그대로 사용 | 단방향이라 presence/ack가 어렵다 |
| **Socket.IO** | 룸, ack, 자동 재연결, Redis adapter | 자체 프로토콜이라 클라이언트도 Socket.IO가 필요하다 |
| CRDT(Yjs 등) | 오프라인 병합 | 칸반의 "서버가 순서를 확정"하는 모델과 맞지 않고 과하다 |

## 결정

- **Socket.IO**를 쓰고, 보드 단위 룸 `board:{boardId}`를 둔다. JWT는 handshake `auth.token`으로 검증한다.
- 서버 → 클라이언트 변경 이벤트는 **하나의 소켓 이벤트 이름 `board:event`** 로 보낸다. 봉투는 `{ type, payload, seq, boardId, actorId, at }`이다.
  - `type`에는 명세의 `card:moved`, `card:updated` 같은 이름이 들어간다.
  - 이벤트 종류가 여러 소켓 이벤트로 나뉘면 수신 순서를 한 곳에서 seq로 관리하기 어렵다. 그래서 한 채널로 받아 `EventSequencer`가 순서를 맞춘다.
- 웹 클라이언트의 **쓰기는 REST**로 보낸다. 게이트웨이에도 `card:move` 같은 쓰기 핸들러(ack)가 있고, 둘 다 같은 서비스 계층을 호출한다.
  - REST는 HTTP 상태 코드, 재시도, TanStack Query mutation과 자연스럽게 맞는다.
  - 소켓 쓰기는 명세 호환과 저지연 클라이언트(부하 테스트 등)를 위해 남겨 두었다.
- 클라이언트는 이벤트를 `applyBoardEvent()`(packages/shared, 순수 함수)로 TanStack Query 캐시에 반영한다.
  - 카드/리스트는 **version이 더 큰 쪽만 반영**한다. 그래서 내 요청의 REST 응답과 브로드캐스트가 둘 다 와도 멱등하다.
- 접속자 표시(presence)는 `fetchSockets()`로 룸의 소켓을 모아 계산한다. Redis adapter를 쓰면 다른 서버 인스턴스의 소켓도 포함된다.

## 이유

- 쓰기 경로가 하나(서비스 계층 → `BoardWriter`)라서, 권한 검사, seq 발급, 활동 로그가 REST와 소켓에서 똑같이 동작한다.
- 이벤트 리듀서를 shared에 두면 서버 없이 단위 테스트로 수렴성을 검증할 수 있다.
