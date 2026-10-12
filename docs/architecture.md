# 아키텍처

## 1. 시스템 구성

```mermaid
flowchart LR
  subgraph Client["브라우저 (React SPA)"]
    UI["보드 UI<br/>dnd-kit · shadcn/ui"]
    Q["TanStack Query 캐시<br/>(서버 상태)"]
    Z["Zustand<br/>(인증 · UI 상태)"]
    SEQ["EventSequencer<br/>+ applyBoardEvent"]
    UI --> Q
    SEQ --> Q
  end

  LB["Nginx / Fly Proxy<br/>(라운드로빈, sticky 불필요)"]

  subgraph API["api 인스턴스 × N (NestJS)"]
    REST["REST Controllers<br/>/api/*"]
    GW["Socket.IO Gateway<br/>board:{id} 룸"]
    SVC["서비스 계층<br/>Boards · Lists · Cards"]
    BW["BoardWriter<br/>보드별 대기열 → 행 잠금 → seq"]
    EV["BoardEventsService"]
    REST --> SVC
    GW --> SVC
    SVC --> BW
    BW --> EV
    EV --> GW
  end

  PG[("PostgreSQL<br/>단일 진실 소스")]
  RD[("Redis<br/>seq INCR · 이벤트 로그(ZSET)<br/>Socket.IO adapter Pub/Sub")]

  UI -- "HTTPS (쓰기: REST)" --> LB
  SEQ -- "WSS (board:event, presence)" --> LB
  LB --> REST
  LB --> GW
  BW --> PG
  EV --> RD
  GW <--> RD
```

- **쓰기**: 클라이언트는 REST로 변경을 요청한다. 소켓의 `card:move` 같은 쓰기 이벤트도 같은 서비스 계층을 호출한다.
- **읽기 동기화**: 서버는 커밋 후 `board:event`(seq 포함)를 룸으로 브로드캐스트한다. 클라이언트는 seq 순서대로 캐시에 반영한다.
- **수평 확장**: Socket.IO Redis adapter가 인스턴스 간 브로드캐스트와 `fetchSockets`(presence)를 공유한다. seq는 Redis `INCRBY`로 발급하므로 인스턴스와 무관하게 단조 증가한다.
- **배포**: 단일 이미지. api가 web 정적 파일도 서빙해 같은 오리진을 쓰므로 쿠키/CORS 설정이 단순하다.

## 2. 모노레포 구조

```
apps/
  api/            NestJS 11 · Prisma 6 · Socket.IO
    src/auth        JWT access + 회전 refresh token(httpOnly 쿠키)
    src/boards      보드/멤버, BoardAccessService(권한 검사)
    src/lists       리스트 CRUD/이동
    src/cards       카드 CRUD/이동/댓글
    src/common      BoardWriter(쓰기 골격), KeyedSemaphore, 에러 필터, 로깅
    src/events      seq 발급 · Redis 이벤트 로그 · 발행
    src/realtime    Socket.IO 게이트웨이, Redis adapter
    test/           실제 PostgreSQL/Redis e2e (REST · 소켓 · 동시성 · 멀티 인스턴스)
  web/            React 19 · Vite · TanStack Query · Zustand · dnd-kit · shadcn/ui
    src/features/board   보드 캔버스, 낙관적 업데이트, 실시간 훅
packages/
  shared/         api·web 공유: 도메인/이벤트 타입, fractional indexing,
                  planInsert(순서 계산), applyBoardEvent(리듀서), EventSequencer
e2e/              Playwright (브라우저 2개 · 끊김/복구 · 권한 · 멀티 서버)
load/             카드 이동 부하 테스트 (요청/전파 지연, 수렴 검증)
```

순서 계산(`planInsert`)과 이벤트 리듀서(`applyBoardEvent`)를 **서버와 클라이언트가 같은 코드로** 쓰는 것이 핵심이다.
낙관적 업데이트 결과가 서버 확정 결과와 대부분 일치하고, 수렴성은 순수 함수 단위 테스트로 검증한다.

## 3. 데이터 모델 (ERD)

```mermaid
erDiagram
  User ||--o{ BoardMember : "참여"
  User ||--o{ Board : "소유"
  User ||--o{ RefreshToken : ""
  User ||--o{ Comment : "작성"
  User |o--o{ Card : "담당"
  Board ||--o{ BoardMember : ""
  Board ||--o{ List : ""
  Board ||--o{ Activity : "활동 로그"
  List ||--o{ Card : ""
  Card ||--o{ Comment : ""

  User {
    uuid id PK
    string email UK
    string passwordHash
    string name
  }
  Board {
    uuid id PK
    string title
    uuid ownerId FK
  }
  BoardMember {
    uuid boardId PK
    uuid userId PK
    enum role "OWNER | EDITOR | VIEWER"
  }
  List {
    uuid id PK
    uuid boardId FK
    string title
    string position "COLLATE C, fractional index"
    int version
  }
  Card {
    uuid id PK
    uuid listId FK
    string title
    string description
    string position "COLLATE C, fractional index"
    uuid assigneeId FK "nullable"
    datetime dueDate "nullable"
    int version "낙관적 잠금"
  }
  Comment {
    uuid id PK
    uuid cardId FK
    uuid authorId FK
    string content
  }
  Activity {
    uuid id PK
    uuid boardId FK
    uuid actorId FK
    string type
    json payload "seq 포함"
  }
  RefreshToken {
    uuid id PK
    uuid userId FK
    string tokenHash UK
    datetime expiresAt
    datetime revokedAt
  }
```

인덱스: `Card(listId, position)`, `List(boardId, position)`, `Activity(boardId, createdAt)`, `BoardMember(userId)`, `Comment(cardId, createdAt)`

## 4. 카드 이동 시퀀스

```mermaid
sequenceDiagram
  autonumber
  actor A as Alice (브라우저)
  participant API as api 인스턴스 1
  participant PG as PostgreSQL
  participant R as Redis
  participant API2 as api 인스턴스 2
  actor B as Bob (브라우저)

  A->>A: 드롭 → planInsert로 위치 계산, 캐시에 낙관적 반영 (version 유지)
  A->>API: POST /api/cards/:id/move { toListId, beforeCardId, afterCardId }
  API->>PG: requireCardRole (권한 확인, 쿼리 1회)
  API->>API: 보드별 대기열 (KeyedSemaphore, 동시 2)
  API->>PG: BEGIN · SELECT Board FOR UPDATE
  API->>PG: 대상 리스트의 실제 순서 조회 → planInsert (서버 확정)
  API->>PG: UPDATE card (position, listId, version+1)
  API->>R: INCRBY board:{id}:seq  → seq
  API->>PG: INSERT Activity · COMMIT
  API->>R: ZADD 이벤트 로그 (score = seq)
  API-->>A: 200 CardDto (version+1) → 캐시 확정
  API->>R: Socket.IO adapter publish (board:{id})
  R-->>API2: 브로드캐스트 전달
  API2-->>B: board:event { type: card:moved, seq, payload }
  B->>B: EventSequencer (seq 순서 보장) → applyBoardEvent (version 비교)
  Note over A: 실패 응답이면 이전 카드로 롤백 + 토스트<br/>409 VERSION_CONFLICT면 서버 최신값으로 교체
```

## 5. 재연결 복구 시퀀스

```mermaid
sequenceDiagram
  autonumber
  actor B as Bob (브라우저)
  participant API as api
  participant R as Redis

  Note over B: 네트워크 끊김 (lastSeq = 41)
  B--xAPI: 소켓 연결 끊김 → "재연결 중…" 표시
  Note over API: 그 사이 seq 42~45 이벤트 발생 (Redis ZSET에 기록)
  B->>API: 재연결 (auth.token = 최신 access token)
  alt access token 만료
    API-->>B: connect_error UNAUTHORIZED
    B->>API: POST /api/auth/refresh (httpOnly 쿠키) → 재접속
  end
  B->>API: board:join { boardId }
  B->>API: sync { boardId, lastSeq: 41 }
  API->>R: ZRANGEBYSCORE (41 +inf
  alt 로그 범위 안
    API-->>B: { kind: events, events: [42..45], seq: 45 }
    B->>B: 순서대로 적용, 롤백으로 빈 seq는 advanceTo(45)로 건너뜀
  else 범위 밖 (오래 끊김 / seq 초기화)
    API-->>B: { kind: snapshot, snapshot }
    B->>B: 스냅샷 채택 (그 이후 받은 이벤트는 다시 적용)
  end
```

## 6. 정합성 규칙 요약

| 규칙                                                                 | 구현 위치                                          |
| -------------------------------------------------------------------- | -------------------------------------------------- |
| 쓰기의 단일 진실 소스는 DB, 최종 position은 서버가 확정              | `CardsService.move` → `planInsert`                 |
| 같은 보드의 쓰기는 직렬화 (position 중복 방지, seq 순서 = 커밋 순서) | `BoardWriter` (대기열 + `FOR UPDATE`)              |
| 스냅샷과 이벤트의 경계가 정확히 맞음                                 | `BoardsService.snapshot` (`FOR SHARE` 후 seq 읽기) |
| 이벤트 적용은 version이 더 클 때만 → 멱등, 순서 무관 수렴            | `applyBoardEvent` / `upsertCard`                   |
| 서버 확정 응답(409 current)은 같은 version이어도 채택                | `upsertCard(…, authoritative)`                     |
| seq 공백 → 잠시 대기 후 sync, 롤백 공백은 건너뜀                     | `EventSequencer`, `useBoardRealtime`               |
| 권한은 REST·소켓 모두 매 요청 DB로 확인, 역할 변경은 즉시 반영       | `BoardAccessService`, `member:*` 이벤트            |
