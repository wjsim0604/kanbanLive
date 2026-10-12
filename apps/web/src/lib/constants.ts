import type { Role } from '@kanban/shared';

/** 시드 데이터로 만들어지는 데모 계정 (apps/api/prisma/seed.ts) */
export const DEMO_ACCOUNT = { email: 'demo@kanban.live', password: 'demo1234' };

export const ROLE_LABEL: Record<Role, string> = {
  OWNER: '소유자',
  EDITOR: '편집자',
  VIEWER: '뷰어',
};

/** dnd-kit에서 리스트와 카드 id를 구분하기 위한 접두사 */
export const listDndId = (id: string) => `list:${id}`;
