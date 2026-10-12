# 실시간 협업 칸반보드 — 프로젝트 지침

## 1. 프로젝트 개요

- **이름(가칭)**: Kanban Live
- **목적**: 여러 사용자가 같은 보드를 동시에 보고 편집하는 실시간 칸반보드. 이직용 풀스택 포트폴리오의 대표작.
- **핵심 가치**: 기능 수보다 **동기화 문제를 어떻게 풀었는지**(동시 이동 충돌, 낙관적 업데이트, 재연결 복구, 다중 서버 확장)를 보여주는 것.
- **범위 원칙**: MVP를 먼저 끝까지 배포하고, 이후 차별화 기능을 얹는다. 미완성 기능 여러 개보다 동작하는 핵심 기능이 우선.

## 2. 기술 스택 (기본값)

| 영역 | 선택 |
|---|---|
| 프론트엔드 | React + TypeScript + Vite, TanStack Query, Zustand, dnd-kit(드래그 앤 드롭), Tailwind CSS |
| 백엔드 | Node.js + NestJS + TypeScript, Socket.IO(WebSocket Gateway) |
| DB | PostgreSQL + Prisma |
| 캐시/메시징 | Redis (Socket.IO Redis adapter, Pub/Sub) |
| 인증 | JWT (access + refresh), 비밀번호는 argon2 또는 bcrypt |
| 테스트 | Vitest/Jest (단위), Playwright (E2E, 브라우저 2개 동시 접속) |
| 인프라 | Docker, docker-compose(로컬), GitHub Actions(CI), 배포는 Fly.io 또는 Render |
| 문서 | OpenAPI(Swagger), Mermaid 다이어그램 |

구조: 모노레포 (`apps/web`, `apps/api`, `packages/shared`). 공유 타입(이벤트 페이로드 등)은 `packages/shared`에 둔다.

## 3. 기능 명세

### MVP (필수)
- 회원가입 / 로그인 / 로그아웃
- 보드 생성·조회·수정·삭제, 보드 멤버 초대
- 리스트(컬럼) 생성·이름 변경·삭제·순서 이동
- 카드 생성·수정·삭제·리스트 간/내 이동 (드래그 앤 드롭)
- 카드 상세: 제목, 설명, 담당자, 마감일, 댓글
- **실시간 동기화**: 같은 보드에 접속한 모든 사용자에게 변경 즉시 반영
- 접속자 표시(Presence): 현재 보드를 보고 있는 사람 아바타

### 차별화 (MVP 이후, 2~3개 선택)
1. 낙관적 업데이트 + 서버 확정/롤백
2. 동시 이동 충돌 처리 (fractional indexing, 서버 순서 확정)
3. 재연결 시 누락 이벤트 복구
4. Redis 기반 다중 서버 수평 확장
5. 권한 모델 (OWNER / EDITOR / VIEWER)
6. 활동 로그 (변경 이력) 및 실행 취소

## 4. 데이터 모델 (초안)

```
User        id, email(unique), passwordHash, name, createdAt
Board       id, title, ownerId -> User, createdAt, updatedAt
BoardMember boardId, userId, role(OWNER|EDITOR|VIEWER)   // PK(boardId, userId)
List        id, boardId, title, position(string), createdAt
Card        id, listId, title, description, position(string),
            assigneeId?, dueDate?, version(int), createdAt, updatedAt
Comment     id, cardId, authorId, content, createdAt
Activity    id, boardId, actorId, type, payload(json), createdAt   // 활동 로그용
```

- `position`은 **문자열 기반 fractional indexing**(예: `fractional-indexing` 라이브러리)으로 저장해서, 카드 하나를 옮길 때 다른 카드의 순서 값을 갱신하지 않도록 한다.
- `Card.version`은 낙관적 락/충돌 감지용.
- 조회 패턴에 맞춰 인덱스 설계: `Card(listId, position)`, `List(boardId, position)`, `Activity(boardId, createdAt)`.

## 5. REST API (초안)

```
POST   /auth/signup | /auth/login | /auth/refresh | /auth/logout
GET    /boards                      내가 속한 보드 목록
POST   /boards                      보드 생성
GET    /boards/:id                  보드 전체(리스트+카드) 조회
PATCH  /boards/:id    DELETE /boards/:id
POST   /boards/:id/members          멤버 초대
POST   /boards/:id/lists            PATCH/DELETE /lists/:id
POST   /lists/:id/cards             PATCH/DELETE /cards/:id
POST   /cards/:id/move              { toListId, beforeCardId?, afterCardId? }
POST   /cards/:id/comments
```

- 모든 입력은 DTO + class-validator로 검증, 에러 응답 형식 통일.
- Swagger 문서를 `/docs`에서 제공.

## 6. 실시간 이벤트 설계 (Socket.IO)

- 네임스페이스/룸: 보드 단위 룸 `board:{boardId}`. 접속 시 JWT 검증 + 멤버 권한 확인 후 join.
- 클라이언트 → 서버: `card:move`, `card:update`, `card:create`, `card:delete`, `list:*`, `comment:add`, `presence:ping`
- 서버 → 클라이언트(브로드캐스트): `card:moved`, `card:updated`, `card:created`, `card:deleted`, `list:*`, `comment:added`, `presence:changed`
- 모든 서버 발행 이벤트에는 **보드 단위 증가 시퀀스 번호(`seq`)** 를 붙인다. (재연결 복구용)
- 이벤트 페이로드 타입은 `packages/shared`에서 정의하고 프론트/백엔드가 함께 import.
- 쓰기의 단일 진실 소스는 서버(DB). 클라이언트는 서버 확정 이벤트를 기준으로 최종 상태를 맞춘다.

## 7. 핵심 로직 설계 가이드

**낙관적 업데이트**
1. 사용자가 카드를 드롭하면 UI를 즉시 갱신하고 서버에 `card:move` 전송
2. 서버가 검증·저장 후 확정 이벤트(`card:moved`, seq 포함)를 브로드캐스트
3. 실패 응답(권한 없음, 카드 삭제됨 등)이 오면 이전 상태로 롤백하고 토스트 표시

**동시 이동 충돌**
- 순서는 fractional indexing으로 계산하되, 최종 `position`은 **서버가 확정**한다.
- 두 사용자가 같은 카드를 동시에 옮기면 서버에 도착한 순서대로 처리(last-write-wins)하고, 결과를 모두에게 브로드캐스트해 수렴시킨다.
- position이 충돌하거나 간격이 너무 좁아지면 해당 리스트를 재정렬(rebalance)한다.

**재연결 복구**
- 클라이언트는 마지막으로 처리한 `seq`를 보관한다.
- 재연결 시 `sync { boardId, lastSeq }`를 보내고, 서버는 누락된 이벤트를 재전송하거나(범위 이내) 전체 스냅샷을 내려준다.
- 이벤트 로그는 Redis(Stream/List)에 최근 N개만 보관.

**다중 서버 확장**
- Socket.IO Redis adapter로 서버 인스턴스 간 브로드캐스트 공유.
- 로컬에서 docker-compose로 API 2개 + Nginx(로드밸런서) 구성해 검증.

**코딩 규칙**
- TypeScript strict 모드. `any` 금지.
- 비즈니스 로직은 서비스 계층, 컨트롤러/게이트웨이는 얇게.
- 핵심 로직(position 계산, 이동 처리, seq 발급, 권한 검사)은 반드시 단위 테스트 작성.
- 커밋은 Phase 내에서 작은 단위로, Conventional Commits 형식(`feat:`, `fix:`, `test:` ...).
- 새 기술 결정을 하면 `docs/decisions/NNN-제목.md`에 "배경 → 선택지 → 결정 → 이유"로 기록 (ADR). 포트폴리오 회고 자료가 됩니다.
- 막혔던 문제와 해결 과정은 `docs/troubleshooting.md`에 "문제 → 원인 → 해결 → 결과"로 누적 기록.
