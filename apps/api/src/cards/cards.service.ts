import { BadRequestException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  boardEvent,
  planInsert,
  type BoardEventInput,
  type CardDetailDto,
  type CardDto,
  type CommentDto,
} from '@kanban/shared';
import { BoardAccessService } from '../boards/board-access.service';
import { BoardWriter } from '../common/board-writer';
import { conflict, ErrorCode, notFound } from '../common/errors';
import { toCardDto, toCommentDto } from '../common/mappers';
import { cardInclude, userSelect } from '../common/prisma-select';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateCardDto, CreateCommentDto, MoveCardDto, UpdateCardDto } from './dto';

@Injectable()
export class CardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: BoardAccessService,
    private readonly writer: BoardWriter,
  ) {}

  async create(userId: string, listId: string, dto: CreateCardDto): Promise<CardDto> {
    const boardId = await this.access.boardIdOfList(listId);
    await this.access.requireRole(userId, boardId, 'EDITOR');
    if (dto.assigneeId) await this.assertMember(boardId, dto.assigneeId);
    return this.writer.write(boardId, userId, async (tx) => {
      const siblings = await this.siblings(tx, listId);
      const plan = planInsert(siblings, '__new__', {});
      const events: BoardEventInput[] = [];
      if (plan.rebalance) events.push(await this.applyRebalance(tx, plan.rebalance, '__new__'));
      const card = await tx.card.create({
        data: {
          listId,
          title: dto.title,
          description: dto.description ?? '',
          assigneeId: dto.assigneeId ?? null,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          position: plan.position,
        },
        include: cardInclude,
      });
      events.push(boardEvent('card:created', { card: toCardDto(card) }));
      return { result: toCardDto(card), events };
    });
  }

  async get(userId: string, cardId: string): Promise<CardDetailDto> {
    const boardId = await this.access.boardIdOfCard(cardId);
    await this.access.requireRole(userId, boardId, 'VIEWER');
    const card = await this.prisma.card.findUnique({
      where: { id: cardId },
      include: {
        ...cardInclude,
        comments: { include: { author: { select: userSelect } }, orderBy: { createdAt: 'asc' } },
      },
    });
    if (!card) throw notFound('Card');
    return { ...toCardDto(card), comments: card.comments.map(toCommentDto) };
  }

  /**
   * 제목/설명 등 필드 수정. expectedVersion이 있으면 낙관적 잠금으로 동시 수정 충돌을 감지한다.
   * 충돌 시 409 VERSION_CONFLICT와 함께 서버의 최신 카드(current)를 돌려준다.
   */
  async update(userId: string, cardId: string, dto: UpdateCardDto): Promise<CardDto> {
    const boardId = await this.access.boardIdOfCard(cardId);
    await this.access.requireRole(userId, boardId, 'EDITOR');
    if (dto.assigneeId) await this.assertMember(boardId, dto.assigneeId);
    return this.writer.write(boardId, userId, async (tx) => {
      const current = await tx.card.findUnique({ where: { id: cardId }, include: cardInclude });
      if (!current) throw notFound('Card');
      if (dto.expectedVersion !== undefined && dto.expectedVersion !== current.version) {
        throw conflict('Card was modified by someone else', ErrorCode.VERSION_CONFLICT, {
          current: toCardDto(current),
        });
      }
      const card = await tx.card.update({
        where: { id: cardId },
        data: {
          title: dto.title,
          description: dto.description,
          assigneeId: dto.assigneeId,
          dueDate:
            dto.dueDate === undefined ? undefined : dto.dueDate ? new Date(dto.dueDate) : null,
          version: { increment: 1 },
        },
        include: cardInclude,
      });
      return {
        result: toCardDto(card),
        events: [boardEvent('card:updated', { card: toCardDto(card) })],
      };
    });
  }

  /**
   * 카드 이동. 보드 잠금 안에서 대상 리스트의 실제 순서를 읽어 position을 서버가 확정한다.
   * 클라이언트 hint(before/after)가 오래된 경우에도 planInsert가 서버 순서 기준으로 보정한다.
   */
  async move(userId: string, cardId: string, dto: MoveCardDto): Promise<CardDto> {
    const boardId = await this.access.boardIdOfCard(cardId);
    await this.access.requireRole(userId, boardId, 'EDITOR');
    return this.writer.write(boardId, userId, async (tx) => {
      const card = await tx.card.findUnique({ where: { id: cardId }, select: { listId: true } });
      if (!card) throw notFound('Card');
      const target = await tx.list.findUnique({
        where: { id: dto.toListId },
        select: { boardId: true },
      });
      if (!target) throw notFound('Target list');
      if (target.boardId !== boardId)
        throw new BadRequestException('Cannot move a card to another board');

      const siblings = await this.siblings(tx, dto.toListId);
      const plan = planInsert(siblings, cardId, {
        beforeId: dto.beforeCardId,
        afterId: dto.afterCardId,
      });
      const events: BoardEventInput[] = [];
      if (plan.rebalance) events.push(await this.applyRebalance(tx, plan.rebalance, cardId));
      const moved = await tx.card.update({
        where: { id: cardId },
        data: { listId: dto.toListId, position: plan.position, version: { increment: 1 } },
        include: cardInclude,
      });
      events.push(boardEvent('card:moved', { card: toCardDto(moved), fromListId: card.listId }));
      return { result: toCardDto(moved), events };
    });
  }

  async remove(userId: string, cardId: string): Promise<void> {
    const boardId = await this.access.boardIdOfCard(cardId);
    await this.access.requireRole(userId, boardId, 'EDITOR');
    await this.writer.write(boardId, userId, async (tx) => {
      const card = await tx.card.findUnique({ where: { id: cardId }, select: { listId: true } });
      if (!card) throw notFound('Card');
      await tx.card.delete({ where: { id: cardId } });
      return {
        result: undefined,
        events: [boardEvent('card:deleted', { cardId, listId: card.listId })],
      };
    });
  }

  async addComment(userId: string, cardId: string, dto: CreateCommentDto): Promise<CommentDto> {
    const boardId = await this.access.boardIdOfCard(cardId);
    await this.access.requireRole(userId, boardId, 'EDITOR');
    return this.writer.write(boardId, userId, async (tx) => {
      const comment = await tx.comment.create({
        data: { cardId, authorId: userId, content: dto.content },
        include: { author: { select: userSelect } },
      });
      const commentCount = await tx.comment.count({ where: { cardId } });
      const result = toCommentDto(comment);
      return { result, events: [boardEvent('comment:added', { comment: result, commentCount })] };
    });
  }

  private siblings(tx: Prisma.TransactionClient, listId: string) {
    return tx.card.findMany({ where: { listId }, select: { id: true, position: true } });
  }

  private async assertMember(boardId: string, userId: string): Promise<void> {
    const role = await this.access.getRole(userId, boardId);
    if (!role) throw new BadRequestException('Assignee must be a member of the board');
  }

  private async applyRebalance(
    tx: Prisma.TransactionClient,
    rebalance: Map<string, string>,
    movingId: string,
  ): Promise<BoardEventInput> {
    const items: { id: string; position: string; version: number }[] = [];
    for (const [id, position] of rebalance) {
      if (id === movingId) continue;
      const c = await tx.card.update({
        where: { id },
        data: { position, version: { increment: 1 } },
      });
      items.push({ id, position: c.position, version: c.version });
    }
    return boardEvent('positions:rebalanced', { kind: 'card', items });
  }
}
