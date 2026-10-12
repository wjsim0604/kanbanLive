import { describe, expect, it } from 'vitest';
import { canEdit, canManage, hasRole } from './roles';

describe('hasRole', () => {
  it('상위 권한은 하위 권한을 포함한다', () => {
    expect(hasRole('OWNER', 'VIEWER')).toBe(true);
    expect(hasRole('OWNER', 'EDITOR')).toBe(true);
    expect(hasRole('EDITOR', 'VIEWER')).toBe(true);
  });

  it('하위 권한은 상위 권한을 갖지 않는다', () => {
    expect(hasRole('VIEWER', 'EDITOR')).toBe(false);
    expect(hasRole('EDITOR', 'OWNER')).toBe(false);
  });

  it('멤버가 아니면(null) 어떤 권한도 없다', () => {
    expect(hasRole(null, 'VIEWER')).toBe(false);
    expect(hasRole(undefined, 'VIEWER')).toBe(false);
  });

  it('canEdit / canManage', () => {
    expect(canEdit('VIEWER')).toBe(false);
    expect(canEdit('EDITOR')).toBe(true);
    expect(canManage('EDITOR')).toBe(false);
    expect(canManage('OWNER')).toBe(true);
  });
});
