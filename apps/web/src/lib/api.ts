import type {
  ApiErrorBody,
  AuthResponse,
  BoardMemberDto,
  BoardSnapshotDto,
  BoardSummaryDto,
  CardDetailDto,
  CardDto,
  CommentDto,
  ListDto,
  Role,
} from '@kanban/shared';
import { useAuthStore } from '@/stores/auth';

// 기본은 같은 오리진(/api). 개발 중에는 Vite proxy가 /api, /socket.io를 api 서버로 전달한다.
export const API_URL = import.meta.env.VITE_API_URL ?? '';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: Partial<ApiErrorBody> & Record<string, unknown>,
  ) {
    super(body.message ?? `Request failed: ${status}`);
  }

  get code(): string | undefined {
    return this.body.code;
  }
}

let refreshing: Promise<boolean> | null = null;

/** 동시에 여러 요청이 401을 받아도 refresh는 한 번만 수행한다 (single-flight). */
export function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const res = await fetch(`${API_URL}/api/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        useAuthStore.getState().clear();
        return false;
      }
      useAuthStore.getState().setSession((await res.json()) as AuthResponse);
      return true;
    } catch {
      useAuthStore.getState().clear();
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

async function request<T>(method: string, path: string, body?: unknown, retry = true): Promise<T> {
  const token = useAuthStore.getState().accessToken;
  const res = await fetch(`${API_URL}/api${path}`, {
    method,
    credentials: 'include',
    headers: {
      ...(body !== undefined && { 'Content-Type': 'application/json' }),
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 && retry && !path.startsWith('/auth/')) {
    if (await refreshSession()) return request<T>(method, path, body, false);
  }
  if (!res.ok) {
    const errBody = (await res.json().catch(() => ({}))) as ApiError['body'];
    throw new ApiError(res.status, errBody);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export const api = {
  signup: (body: { email: string; password: string; name: string }) =>
    request<AuthResponse>('POST', '/auth/signup', body),
  login: (body: { email: string; password: string }) =>
    request<AuthResponse>('POST', '/auth/login', body),
  logout: () => request<void>('POST', '/auth/logout'),

  boards: () => request<BoardSummaryDto[]>('GET', '/boards'),
  createBoard: (title: string) => request<BoardSummaryDto>('POST', '/boards', { title }),
  board: (id: string) => request<BoardSnapshotDto>('GET', `/boards/${id}`),
  updateBoard: (id: string, title: string) =>
    request<BoardSummaryDto>('PATCH', `/boards/${id}`, { title }),
  deleteBoard: (id: string) => request<void>('DELETE', `/boards/${id}`),
  addMember: (boardId: string, email: string, role: Exclude<Role, 'OWNER'>) =>
    request<BoardMemberDto>('POST', `/boards/${boardId}/members`, { email, role }),
  updateMember: (boardId: string, userId: string, role: Exclude<Role, 'OWNER'>) =>
    request<BoardMemberDto>('PATCH', `/boards/${boardId}/members/${userId}`, { role }),
  removeMember: (boardId: string, userId: string) =>
    request<void>('DELETE', `/boards/${boardId}/members/${userId}`),

  createList: (boardId: string, title: string) =>
    request<ListDto>('POST', `/boards/${boardId}/lists`, { title }),
  updateList: (listId: string, title: string) =>
    request<ListDto>('PATCH', `/lists/${listId}`, { title }),
  moveList: (listId: string, hint: { beforeListId: string | null; afterListId: string | null }) =>
    request<ListDto>('POST', `/lists/${listId}/move`, hint),
  deleteList: (listId: string) => request<void>('DELETE', `/lists/${listId}`),

  createCard: (listId: string, title: string) =>
    request<CardDto>('POST', `/lists/${listId}/cards`, { title }),
  card: (cardId: string) => request<CardDetailDto>('GET', `/cards/${cardId}`),
  updateCard: (
    cardId: string,
    patch: {
      title?: string;
      description?: string;
      assigneeId?: string | null;
      dueDate?: string | null;
      expectedVersion?: number;
    },
  ) => request<CardDto>('PATCH', `/cards/${cardId}`, patch),
  moveCard: (
    cardId: string,
    body: { toListId: string; beforeCardId: string | null; afterCardId: string | null },
  ) => request<CardDto>('POST', `/cards/${cardId}/move`, body),
  deleteCard: (cardId: string) => request<void>('DELETE', `/cards/${cardId}`),
  addComment: (cardId: string, content: string) =>
    request<CommentDto>('POST', `/cards/${cardId}/comments`, { content }),
};

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case 'VERSION_CONFLICT':
        return '다른 사용자가 먼저 수정했습니다. 최신 내용으로 갱신했어요.';
      case 'INSUFFICIENT_ROLE':
        return '이 작업을 할 권한이 없습니다.';
      case 'NOT_A_MEMBER':
        return '이 보드의 멤버가 아닙니다.';
      case 'INVALID_CREDENTIALS':
        return '이메일 또는 비밀번호가 올바르지 않습니다.';
      case 'ALREADY_EXISTS':
        return err.message === 'Email already registered'
          ? '이미 가입된 이메일입니다.'
          : '이미 존재합니다.';
      case 'NOT_FOUND':
        return '대상을 찾을 수 없습니다. 이미 삭제되었을 수 있어요.';
    }
    if (err.body.details?.length) return err.body.details.join('\n');
    return err.message;
  }
  if (err instanceof TypeError) return '서버에 연결할 수 없습니다.';
  return err instanceof Error ? err.message : String(err);
}
