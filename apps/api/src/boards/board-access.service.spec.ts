import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BoardAccessService } from './board-access.service';

describe('BoardAccessService.requireRole', () => {
  const findUnique = jest.fn();
  const service = new BoardAccessService({ board: { findUnique } } as unknown as PrismaService);

  const boardWithRole = (role: Role | null) =>
    findUnique.mockResolvedValue({ members: role ? [{ role }] : [] });

  beforeEach(() => findUnique.mockReset());

  it('보드가 없으면 404', async () => {
    findUnique.mockResolvedValue(null);
    await expect(service.requireRole('u', 'b', 'VIEWER')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('멤버가 아니면 403 NOT_A_MEMBER', async () => {
    boardWithRole(null);
    await expect(service.requireRole('u', 'b', 'VIEWER')).rejects.toMatchObject({
      response: { code: 'NOT_A_MEMBER' },
    });
  });

  it.each<[Role, Role]>([
    ['VIEWER', 'EDITOR'],
    ['VIEWER', 'OWNER'],
    ['EDITOR', 'OWNER'],
  ])('%s 는 %s 권한 작업을 할 수 없다 (403 INSUFFICIENT_ROLE)', async (role, required) => {
    boardWithRole(role);
    const err = await service.requireRole('u', 'b', required).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
    expect(err).toMatchObject({ response: { code: 'INSUFFICIENT_ROLE' } });
  });

  it.each<[Role, Role]>([
    ['VIEWER', 'VIEWER'],
    ['EDITOR', 'VIEWER'],
    ['EDITOR', 'EDITOR'],
    ['OWNER', 'EDITOR'],
    ['OWNER', 'OWNER'],
  ])('%s 는 %s 권한 작업을 할 수 있다', async (role, required) => {
    boardWithRole(role);
    await expect(service.requireRole('u', 'b', required)).resolves.toBe(role);
  });
});
