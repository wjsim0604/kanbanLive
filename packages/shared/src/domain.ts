/**
 * API 응답(JSON) 형태의 도메인 타입. 날짜는 ISO 문자열로 직렬화된다.
 */

export const ROLES = ['OWNER', 'EDITOR', 'VIEWER'] as const;
export type Role = (typeof ROLES)[number];

export interface UserDto {
  id: string;
  email: string;
  name: string;
}

export interface AuthResponse {
  accessToken: string;
  user: UserDto;
}

export interface BoardSummaryDto {
  id: string;
  title: string;
  role: Role;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface BoardMemberDto {
  user: UserDto;
  role: Role;
}

export interface ListDto {
  id: string;
  boardId: string;
  title: string;
  position: string;
  version: number;
  createdAt: string;
}

export interface CardDto {
  id: string;
  boardId: string;
  listId: string;
  title: string;
  description: string;
  position: string;
  assigneeId: string | null;
  dueDate: string | null;
  version: number;
  commentCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CommentDto {
  id: string;
  cardId: string;
  author: UserDto;
  content: string;
  createdAt: string;
}

export interface CardDetailDto extends CardDto {
  comments: CommentDto[];
}

/** GET /boards/:id 응답. 실시간 동기화의 기준 스냅샷이기도 하다. */
export interface BoardSnapshotDto {
  board: {
    id: string;
    title: string;
    ownerId: string;
    createdAt: string;
    updatedAt: string;
  };
  role: Role;
  members: BoardMemberDto[];
  lists: ListDto[];
  cards: CardDto[];
  /** 이 스냅샷에 반영된 마지막 이벤트 seq */
  seq: number;
}

/** 통일된 에러 응답 형식 */
export interface ApiErrorBody {
  statusCode: number;
  error: string;
  message: string;
  details?: string[];
  code?: string;
  path: string;
  timestamp: string;
}
