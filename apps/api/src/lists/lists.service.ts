import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { boardEvent, planInsert, type BoardEventInput, type ListDto } from '@kanban/shared';
import { BoardWriter } from '../common/board-writer';
import { notFound } from '../common/errors';
import { toListDto } from '../common/mappers';
import { BoardAccessService } from '../boards/board-access.service';
import type { CreateListDto, MoveListDto, UpdateListDto } from './dto';

@Injectable()
export class ListsService {
  constructor(
    private readonly access: BoardAccessService,
    private readonly writer: BoardWriter,
  ) {}

  async create(userId: string, boardId: string, dto: CreateListDto): Promise<ListDto> {
    await this.access.requireRole(userId, boardId, 'EDITOR');
    return this.writer.write(boardId, userId, async (tx) => {
      const siblings = await tx.list.findMany({
        where: { boardId },
        select: { id: true, position: true },
      });
      const plan = planInsert(siblings, '__new__', {});
      const events: BoardEventInput[] = [];
      if (plan.rebalance) events.push(await this.applyRebalance(tx, plan.rebalance, '__new__'));
      const list = await tx.list.create({
        data: { boardId, title: dto.title, position: plan.position },
      });
      events.push(boardEvent('list:created', { list: toListDto(list) }));
      return { result: toListDto(list), events };
    });
  }

  async update(userId: string, listId: string, dto: UpdateListDto): Promise<ListDto> {
    const boardId = await this.access.boardIdOfList(listId);
    await this.access.requireRole(userId, boardId, 'EDITOR');
    return this.writer.write(boardId, userId, async (tx) => {
      // 동시에 삭제된 경우 Prisma P2025 → 전역 필터가 404로 변환한다.
      const list = await tx.list.update({
        where: { id: listId },
        data: { title: dto.title, version: { increment: 1 } },
      });
      return {
        result: toListDto(list),
        events: [boardEvent('list:updated', { list: toListDto(list) })],
      };
    });
  }

  async move(userId: string, listId: string, dto: MoveListDto): Promise<ListDto> {
    const boardId = await this.access.boardIdOfList(listId);
    await this.access.requireRole(userId, boardId, 'EDITOR');
    return this.writer.write(boardId, userId, async (tx) => {
      const siblings = await tx.list.findMany({
        where: { boardId },
        select: { id: true, position: true },
      });
      if (!siblings.some((l) => l.id === listId)) throw notFound('List');
      const plan = planInsert(siblings, listId, {
        beforeId: dto.beforeListId,
        afterId: dto.afterListId,
      });
      const events: BoardEventInput[] = [];
      if (plan.rebalance) events.push(await this.applyRebalance(tx, plan.rebalance, listId));
      const list = await tx.list.update({
        where: { id: listId },
        data: { position: plan.position, version: { increment: 1 } },
      });
      events.push(boardEvent('list:moved', { list: toListDto(list) }));
      return { result: toListDto(list), events };
    });
  }

  async remove(userId: string, listId: string): Promise<void> {
    const boardId = await this.access.boardIdOfList(listId);
    await this.access.requireRole(userId, boardId, 'EDITOR');
    await this.writer.write(boardId, userId, async (tx) => {
      const { count } = await tx.list.deleteMany({ where: { id: listId } });
      if (count === 0) throw notFound('List');
      return { result: undefined, events: [boardEvent('list:deleted', { listId })] };
    });
  }

  /** 이동 대상(movingId)을 제외한 리스트들의 position을 균등 간격으로 다시 매긴다. */
  private async applyRebalance(
    tx: Prisma.TransactionClient,
    rebalance: Map<string, string>,
    movingId: string,
  ): Promise<BoardEventInput> {
    const items: { id: string; position: string; version: number }[] = [];
    for (const [id, position] of rebalance) {
      if (id === movingId) continue;
      const l = await tx.list.update({
        where: { id },
        data: { position, version: { increment: 1 } },
      });
      items.push({ id, position: l.position, version: l.version });
    }
    return boardEvent('positions:rebalanced', { kind: 'list', items });
  }
}
