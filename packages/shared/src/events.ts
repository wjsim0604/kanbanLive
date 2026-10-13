import type {
  BoardMemberDto,
  BoardSnapshotDto,
  CardDto,
  CommentDto,
  ListDto,
  UserDto,
} from './domain';

/**
 * 실시간 이벤트 정의 (Socket.IO).
 * 서버 → 클라이언트 브로드캐스트 이벤트는 모두 보드 단위 증가 seq를 가진 BoardEvent 봉투로 전달된다.
 */

export interface BoardEventPayloads {
  'board:updated': { board: BoardSnapshotDto['board'] };
  'board:deleted': { boardId: string };
  'member:added': { member: BoardMemberDto };
  'member:updated': { member: BoardMemberDto };
  'member:removed': { userId: string };
  'list:created': { list: ListDto };
  'list:updated': { list: ListDto };
  'list:moved': { list: ListDto };
  'list:deleted': { listId: string };
  'card:created': { card: CardDto };
  'card:updated': { card: CardDto };
  'card:moved': { card: CardDto; fromListId: string };
  'card:deleted': { cardId: string; listId: string };
  /** position 간격이 좁아져 리스트(또는 보드의 리스트들)를 재배치했을 때 */
  'positions:rebalanced': {
    kind: 'card' | 'list';
    items: { id: string; position: string; version: number }[];
  };
  'comment:added': { comment: CommentDto; commentCount: number };
}

export type BoardEventType = keyof BoardEventPayloads;

export type BoardEvent = {
  [K in BoardEventType]: {
    type: K;
    payload: BoardEventPayloads[K];
    /** 보드 단위 단조 증가 시퀀스 (Redis INCR) */
    seq: number;
    boardId: string;
    actorId: string;
    at: string;
  };
}[BoardEventType];

/** seq 발급 전 서비스 계층이 만드는 이벤트 */
export type BoardEventInput = {
  [K in BoardEventType]: { type: K; payload: BoardEventPayloads[K] };
}[BoardEventType];

export const boardEvent = <K extends BoardEventType>(
  type: K,
  payload: BoardEventPayloads[K],
): BoardEventInput => ({ type, payload }) as BoardEventInput;

export const boardRoom = (boardId: string): string => `board:${boardId}`;

/* ───────── presence ───────── */

export interface PresenceUser extends UserDto {
  /** 같은 사용자가 여러 탭으로 접속한 경우의 연결 수 */
  connections: number;
}

export interface PresenceChanged {
  boardId: string;
  users: PresenceUser[];
}

/* ───────── 클라이언트 → 서버 ───────── */

export interface JoinBoardRequest {
  boardId: string;
  /** 클라이언트가 마지막으로 처리한 seq. 있으면 서버가 누락분을 보내준다. */
  lastSeq?: number;
}

export interface SyncRequest {
  boardId: string;
  lastSeq: number;
}

/** 누락 이벤트가 로그 범위 안이면 events, 벗어나면 snapshot */
export type SyncResponse =
  | { kind: 'events'; events: BoardEvent[]; seq: number }
  | { kind: 'snapshot'; snapshot: BoardSnapshotDto };

export interface CardMoveRequest {
  boardId: string;
  cardId: string;
  toListId: string;
  beforeCardId?: string | null;
  afterCardId?: string | null;
}

export interface CardUpdateRequest {
  boardId: string;
  cardId: string;
  title?: string;
  description?: string;
  assigneeId?: string | null;
  dueDate?: string | null;
  expectedVersion?: number;
}

export interface CardCreateRequest {
  boardId: string;
  listId: string;
  title: string;
  description?: string;
}

export interface CardDeleteRequest {
  boardId: string;
  cardId: string;
}

export interface CommentAddRequest {
  boardId: string;
  cardId: string;
  content: string;
}

export interface ListCreateRequest {
  boardId: string;
  title: string;
}

export interface ListUpdateRequest {
  boardId: string;
  listId: string;
  title: string;
}

export interface ListMoveRequest {
  boardId: string;
  listId: string;
  beforeListId?: string | null;
  afterListId?: string | null;
}

export interface ListDeleteRequest {
  boardId: string;
  listId: string;
}

/** ack 콜백 응답 */
export type Ack<T> =
  { ok: true; data: T } | { ok: false; error: { status: number; code?: string; message: string } };

export interface ServerToClientEvents {
  'board:event': (event: BoardEvent) => void;
  'presence:changed': (presence: PresenceChanged) => void;
}

export interface ClientToServerEvents {
  'board:join': (
    req: JoinBoardRequest,
    ack: (res: Ack<{ role: string; seq: number }>) => void,
  ) => void;
  'board:leave': (req: { boardId: string }) => void;
  sync: (req: SyncRequest, ack: (res: Ack<SyncResponse>) => void) => void;
  'presence:ping': (req: { boardId: string }) => void;
  'card:move': (req: CardMoveRequest, ack: (res: Ack<CardDto>) => void) => void;
  'card:update': (req: CardUpdateRequest, ack: (res: Ack<CardDto>) => void) => void;
  'card:create': (req: CardCreateRequest, ack: (res: Ack<CardDto>) => void) => void;
  'card:delete': (req: CardDeleteRequest, ack: (res: Ack<null>) => void) => void;
  'comment:add': (req: CommentAddRequest, ack: (res: Ack<CommentDto>) => void) => void;
  'list:create': (req: ListCreateRequest, ack: (res: Ack<ListDto>) => void) => void;
  'list:update': (req: ListUpdateRequest, ack: (res: Ack<ListDto>) => void) => void;
  'list:move': (req: ListMoveRequest, ack: (res: Ack<ListDto>) => void) => void;
  'list:delete': (req: ListDeleteRequest, ack: (res: Ack<null>) => void) => void;
}
