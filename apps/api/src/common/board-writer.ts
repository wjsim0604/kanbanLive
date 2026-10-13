import { Injectable, Logger } from '@nestjs/common';
import { performance } from 'node:perf_hooks';
import type { Prisma } from '@prisma/client';
import type { BoardEvent, BoardEventInput } from '@kanban/shared';
import { BoardEventsService } from '../events/board-events.service';
import { PrismaService } from '../prisma/prisma.service';
import { lockBoard } from './board-lock';
import { KeyedSemaphore } from './keyed-semaphore';

export interface WriteResult<T> {
  result: T;
  events: BoardEventInput[];
}

/**
 * 보드 쓰기의 공통 골격. REST 컨트롤러와 소켓 게이트웨이가 같은 서비스 → 같은 골격을 거친다.
 *
 *   [인스턴스 내 보드별 대기열(동시 2)] → BEGIN → 보드 행 잠금 → 변경 → seq 발급 → (Activity 기록) → COMMIT → 이벤트 기록/브로드캐스트
 *
 * 인스턴스 내 대기열(KeyedSemaphore)은 성능 최적화다. 같은 보드의 쓰기가 DB 커넥션을 잡은 채 행 잠금을 기다리면
 * 커넥션 풀이 고갈되어 다른 보드의 요청까지 느려진다 (docs/performance.md). 보드당 동시 트랜잭션을 2개로 제한해
 * (하나는 잠금 보유, 하나는 바로 뒤에서 대기 → 잠금 인계가 빠름) 풀 점유를 막는다.
 * 인스턴스 간 정합성은 여전히 DB 행 잠금이 보장한다.
 */
@Injectable()
export class BoardWriter {
  private readonly logger = new Logger(BoardWriter.name);
  /** 보드 잠금을 이보다 오래 잡으면 경고 로그를 남긴다 (병목 탐지) */
  private readonly slowMs = Number(process.env.SLOW_WRITE_MS ?? 100);
  private readonly queue = new KeyedSemaphore(Number(process.env.BOARD_WRITE_CONCURRENCY ?? 2));

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: BoardEventsService,
  ) {}

  async write<T>(
    boardId: string,
    actorId: string,
    fn: (tx: Prisma.TransactionClient) => Promise<WriteResult<T>>,
  ): Promise<T> {
    return this.queue.run(boardId, async () => {
      const { result, allocated } = await this.transaction(boardId, actorId, fn);
      // 커밋 직후 발행 (DB 잠금은 이미 해제됨). 발행 순서가 seq와 어긋나도 클라이언트 EventSequencer가 맞춘다.
      await this.events.dispatch(allocated);
      return result;
    });
  }

  private transaction<T>(
    boardId: string,
    actorId: string,
    fn: (tx: Prisma.TransactionClient) => Promise<WriteResult<T>>,
  ): Promise<{ result: T; allocated: BoardEvent[] }> {
    return this.prisma.$transaction(async (tx) => {
      await lockBoard(tx, boardId);
      const lockedAt = performance.now();
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
      const heldMs = performance.now() - lockedAt;
      if (heldMs > this.slowMs) {
        this.logger.warn(
          { boardId, heldMs: Math.round(heldMs), events: allocated.map((e) => e.type) },
          'slow board write',
        );
      }
      return { result, allocated };
    });
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
