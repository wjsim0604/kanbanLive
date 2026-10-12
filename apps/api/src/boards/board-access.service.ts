import { Injectable } from '@nestjs/common';
import type { Role } from '@prisma/client';
import { hasRole } from '@kanban/shared';
import { ErrorCode, forbidden, notFound } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';

/**
 * 보드 멤버십 기반 권한 검사. REST와 소켓이 모두 이 서비스를 사용한다.
 * - 보드가 없으면 404
 * - 멤버가 아니면 403 NOT_A_MEMBER
 * - 권한이 부족하면 403 INSUFFICIENT_ROLE
 */
@Injectable()
export class BoardAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async requireRole(userId: string, boardId: string, required: Role): Promise<Role> {
    const board = await this.prisma.board.findUnique({
      where: { id: boardId },
      select: { members: { where: { userId }, select: { role: true } } },
    });
    if (!board) throw notFound('Board');
    const role = board.members[0]?.role;
    if (!role) throw forbidden('You are not a member of this board', ErrorCode.NOT_A_MEMBER);
    if (!hasRole(role, required)) {
      throw forbidden(`This action requires ${required} role`, ErrorCode.INSUFFICIENT_ROLE);
    }
    return role;
  }

  async getRole(userId: string, boardId: string): Promise<Role | null> {
    const member = await this.prisma.boardMember.findUnique({
      where: { boardId_userId: { boardId, userId } },
      select: { role: true },
    });
    return member?.role ?? null;
  }

  async boardIdOfList(listId: string): Promise<string> {
    const list = await this.prisma.list.findUnique({
      where: { id: listId },
      select: { boardId: true },
    });
    if (!list) throw notFound('List');
    return list.boardId;
  }

  async boardIdOfCard(cardId: string): Promise<string> {
    const card = await this.prisma.card.findUnique({
      where: { id: cardId },
      select: { list: { select: { boardId: true } } },
    });
    if (!card) throw notFound('Card');
    return card.list.boardId;
  }
}
