import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { BoardEvent, BoardEventInput } from '@kanban/shared';
import { BoardEventsService } from '../events/board-events.service';
import { PrismaService } from '../prisma/prisma.service';
import { lockBoard } from './board-lock';

export interface WriteResult<T> {
  result: T;
  events: BoardEventInput[];
}

/**
 * 보드 쓰기의 공통 골격. REST 컨트롤러와 소켓 게이트웨이가 같은 서비스 → 같은 골격을 거친다.
 *
 *   BEGIN → 보드 잠금 → 변경 → seq 발급 → (Activity 기록) → COMMIT → 이벤트 기록/브로드캐스트
 */
@Injectable()
export class BoardWriter {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: BoardEventsService,
  ) {}

  async write<T>(
    boardId: string,
    actorId: string,
    fn: (tx: Prisma.TransactionClient) => Promise<WriteResult<T>>,
  ): Promise<T> {
    const { result, allocated } = await this.prisma.$transaction(async (tx) => {
      await lockBoard(tx, boardId);
      const { result, events } = await fn(tx);
      const allocated = await this.events.allocate(boardId, actorId, events);
      if (allocated.length > 0) {
        await tx.activity.createMany({
          data: allocated.map((e) => ({
            boardId,
            actorId,
            type: e.type,
            payload: { seq: e.seq, ...summarize(e) },
          })),
        });
      }
      return { result, allocated };
    });
    await this.events.dispatch(allocated);
    return result;
  }
}

/** 활동 로그에는 전체 페이로드 대신 식별자와 핵심 필드만 남긴다. */
function summarize(e: BoardEvent): Prisma.InputJsonObject {
  switch (e.type) {
    case 'card:created':
    case 'card:updated':
      return { cardId: e.payload.card.id, title: e.payload.card.title };
    case 'card:moved':
      return {
        cardId: e.payload.card.id,
        fromListId: e.payload.fromListId,
        toListId: e.payload.card.listId,
      };
    case 'card:deleted':
      return { cardId: e.payload.cardId };
    case 'list:created':
    case 'list:updated':
    case 'list:moved':
      return { listId: e.payload.list.id, title: e.payload.list.title };
    case 'list:deleted':
      return { listId: e.payload.listId };
    case 'comment:added':
      return { cardId: e.payload.comment.cardId, commentId: e.payload.comment.id };
    case 'member:added':
    case 'member:updated':
      return { userId: e.payload.member.user.id, role: e.payload.member.role };
    case 'member:removed':
      return { userId: e.payload.userId };
    case 'positions:rebalanced':
      return { kind: e.payload.kind, count: e.payload.items.length };
    case 'board:updated':
      return { title: e.payload.board.title };
    case 'board:deleted':
      return {};
  }
}
