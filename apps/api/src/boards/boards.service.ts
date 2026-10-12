import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  boardEvent,
  generateNKeysBetween,
  sortByPosition,
  type BoardMemberDto,
  type BoardSnapshotDto,
  type BoardSummaryDto,
} from '@kanban/shared';
import { BoardWriter } from '../common/board-writer';
import { conflict, ErrorCode, forbidden, notFound } from '../common/errors';
import { toCardDto, toListDto, toUserDto } from '../common/mappers';
import { cardInclude, userSelect } from '../common/prisma-select';
import { BoardEventsService } from '../events/board-events.service';
import { PrismaService } from '../prisma/prisma.service';
import { BoardAccessService } from './board-access.service';
import type { AddMemberDto, CreateBoardDto, UpdateBoardDto, UpdateMemberDto } from './dto';

export const DEFAULT_LISTS = ['할 일', '진행 중', '완료'];

const toBoard = (b: {
  id: string;
  title: string;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
}) => ({
  id: b.id,
  title: b.title,
  ownerId: b.ownerId,
  createdAt: b.createdAt.toISOString(),
  updatedAt: b.updatedAt.toISOString(),
});

@Injectable()
export class BoardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: BoardAccessService,
    private readonly writer: BoardWriter,
    private readonly events: BoardEventsService,
  ) {}

  async listForUser(userId: string): Promise<BoardSummaryDto[]> {
    const memberships = await this.prisma.boardMember.findMany({
      where: { userId },
      include: { board: true },
      orderBy: { board: { updatedAt: 'desc' } },
    });
    return memberships.map((m) => ({ ...toBoard(m.board), role: m.role }));
  }

  async create(userId: string, dto: CreateBoardDto): Promise<BoardSummaryDto> {
    const positions = generateNKeysBetween(null, null, DEFAULT_LISTS.length);
    const board = await this.prisma.board.create({
      data: {
        title: dto.title,
        ownerId: userId,
        members: { create: { userId, role: 'OWNER' } },
        lists: {
          create: DEFAULT_LISTS.map((title, i) => ({ title, position: positions[i] as string })),
        },
      },
    });
    return { ...toBoard(board), role: 'OWNER' };
  }

  /**
   * 보드 전체 스냅샷.
   * 보드 행을 FOR SHARE로 잠근 뒤 seq와 데이터를 읽는다. 쓰기는 FOR UPDATE + 트랜잭션 안에서 seq를 발급하므로,
   * 스냅샷의 seq 이하 이벤트는 모두 데이터에 반영되어 있고 그 이후 이벤트는 반영되어 있지 않다.
   */
  async snapshot(userId: string, boardId: string): Promise<BoardSnapshotDto> {
    const role = await this.access.requireRole(userId, boardId, 'VIEWER');
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Board" WHERE id = ${boardId}::uuid FOR SHARE`;
      const seq = await this.events.currentSeq(boardId);
      const board = await tx.board.findUnique({
        where: { id: boardId },
        include: {
          members: { include: { user: { select: userSelect } }, orderBy: { createdAt: 'asc' } },
          lists: true,
        },
      });
      if (!board) throw notFound('Board');
      const cards = await tx.card.findMany({ where: { list: { boardId } }, include: cardInclude });
      return {
        board: toBoard(board),
        role,
        members: board.members.map((m) => ({ user: toUserDto(m.user), role: m.role })),
        lists: sortByPosition(board.lists).map(toListDto),
        cards: sortByPosition(cards).map(toCardDto),
        seq,
      };
    });
  }

  async update(userId: string, boardId: string, dto: UpdateBoardDto): Promise<BoardSummaryDto> {
    const role = await this.access.requireRole(userId, boardId, 'OWNER');
    return this.writer.write(boardId, userId, async (tx) => {
      const board = await tx.board.update({ where: { id: boardId }, data: { title: dto.title } });
      return {
        result: { ...toBoard(board), role },
        events: [boardEvent('board:updated', { board: toBoard(board) })],
      };
    });
  }

  async remove(userId: string, boardId: string): Promise<void> {
    await this.access.requireRole(userId, boardId, 'OWNER');
    // 보드가 사라지면 Activity도 함께 삭제되므로 BoardWriter를 거치지 않고 직접 발행한다.
    const events = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Board" WHERE id = ${boardId}::uuid FOR UPDATE`;
      await tx.board.delete({ where: { id: boardId } });
      return this.events.allocate(boardId, userId, [boardEvent('board:deleted', { boardId })]);
    });
    await this.events.dispatch(events);
  }

  async listMembers(userId: string, boardId: string): Promise<BoardMemberDto[]> {
    await this.access.requireRole(userId, boardId, 'VIEWER');
    const members = await this.prisma.boardMember.findMany({
      where: { boardId },
      include: { user: { select: userSelect } },
      orderBy: { createdAt: 'asc' },
    });
    return members.map((m) => ({ user: toUserDto(m.user), role: m.role }));
  }

  async addMember(userId: string, boardId: string, dto: AddMemberDto): Promise<BoardMemberDto> {
    await this.access.requireRole(userId, boardId, 'OWNER');
    const invitee = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: userSelect,
    });
    if (!invitee) throw notFound('User with this email');
    return this.writer.write(boardId, userId, async (tx) => {
      try {
        await tx.boardMember.create({ data: { boardId, userId: invitee.id, role: dto.role } });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          throw conflict('User is already a member', ErrorCode.ALREADY_EXISTS);
        }
        throw e;
      }
      const member: BoardMemberDto = { user: toUserDto(invitee), role: dto.role };
      return { result: member, events: [boardEvent('member:added', { member })] };
    });
  }

  async updateMember(
    userId: string,
    boardId: string,
    memberId: string,
    dto: UpdateMemberDto,
  ): Promise<BoardMemberDto> {
    await this.access.requireRole(userId, boardId, 'OWNER');
    return this.writer.write(boardId, userId, async (tx) => {
      const existing = await this.findMemberOrThrow(tx, boardId, memberId);
      if (existing.role === 'OWNER') {
        throw forbidden("The owner's role cannot be changed", ErrorCode.INSUFFICIENT_ROLE);
      }
      const updated = await tx.boardMember.update({
        where: { boardId_userId: { boardId, userId: memberId } },
        data: { role: dto.role },
        include: { user: { select: userSelect } },
      });
      const member: BoardMemberDto = { user: toUserDto(updated.user), role: updated.role };
      return { result: member, events: [boardEvent('member:updated', { member })] };
    });
  }

  async removeMember(userId: string, boardId: string, memberId: string): Promise<void> {
    // 본인은 스스로 나갈 수 있고, 다른 사람을 내보내려면 OWNER여야 한다.
    await this.access.requireRole(userId, boardId, memberId === userId ? 'VIEWER' : 'OWNER');
    await this.writer.write(boardId, userId, async (tx) => {
      const existing = await this.findMemberOrThrow(tx, boardId, memberId);
      if (existing.role === 'OWNER') {
        throw forbidden('The owner cannot leave or be removed', ErrorCode.INSUFFICIENT_ROLE);
      }
      await tx.boardMember.delete({ where: { boardId_userId: { boardId, userId: memberId } } });
      // 나간 멤버가 담당하던 카드는 담당자를 비운다.
      const where = { assigneeId: memberId, list: { boardId } };
      const affected = await tx.card.findMany({ where, select: { id: true } });
      await tx.card.updateMany({ where, data: { assigneeId: null, version: { increment: 1 } } });
      const cards = await tx.card.findMany({
        where: { id: { in: affected.map((c) => c.id) } },
        include: cardInclude,
      });
      return {
        result: undefined,
        events: [
          boardEvent('member:removed', { userId: memberId }),
          ...cards.map((c) => boardEvent('card:updated', { card: toCardDto(c) })),
        ],
      };
    });
  }

  private async findMemberOrThrow(tx: Prisma.TransactionClient, boardId: string, userId: string) {
    const member = await tx.boardMember.findUnique({
      where: { boardId_userId: { boardId, userId } },
    });
    if (!member) throw notFound('Member');
    return member;
  }
}
