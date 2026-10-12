import type { Role } from './domain';

const RANK: Record<Role, number> = { VIEWER: 0, EDITOR: 1, OWNER: 2 };

/** role이 required 이상의 권한을 갖는지. (OWNER > EDITOR > VIEWER) */
export function hasRole(role: Role | null | undefined, required: Role): boolean {
  if (!role) return false;
  return RANK[role] >= RANK[required];
}

export const canEdit = (role: Role | null | undefined): boolean => hasRole(role, 'EDITOR');
export const canManage = (role: Role | null | undefined): boolean => hasRole(role, 'OWNER');
