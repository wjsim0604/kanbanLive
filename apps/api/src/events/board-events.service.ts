import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import type { BoardEvent, BoardEventInput } from '@kanban/shared';
import { REDIS } from '../redis/redis.module';

/** 보드별로 Redis에 보관하는 최근 이벤트 수. 이보다 오래 끊겼던 클라이언트는 스냅샷을 받는다. */
export const EVENT_LOG_SIZE = 500;

export const seqKey = (boardId: string) => `board:${boardId}:seq`;
export const logKey = (boardId: string) => `board:${boardId}:events`;

type Listener = (event: BoardEvent) => void;

/**
 * 보드 이벤트 발행.
 *
 * 1) allocate(): 쓰기 트랜잭션 안(보드 잠금 보유 중)에서 Redis INCR로 seq를 발급한다.
 *    → seq 순서 = 커밋 순서
 * 2) dispatch(): 커밋 후 이벤트를 Redis 정렬 집합(score = seq)에 기록하고 리스너(소켓 게이트웨이)에 전달한다.
 *
 * 트랜잭션이 롤백되면 발급된 seq는 비게 되며, 클라이언트는 sync 응답의 seq로 공백을 건너뛴다.
 */
@Injectable()
export class BoardEventsService {
  private readonly logger = new Logger(BoardEventsService.name);
  private readonly listeners = new Set<Listener>();

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async allocate(
    boardId: string,
    actorId: string,
    inputs: BoardEventInput[],
  ): Promise<BoardEvent[]> {
    if (inputs.length === 0) return [];
    const last = await this.redis.incrby(seqKey(boardId), inputs.length);
    const first = last - inputs.length + 1;
    const at = new Date().toISOString();
    return inputs.map(
      (input, i) => ({ ...input, seq: first + i, boardId, actorId, at }) as BoardEvent,
    );
  }

  async dispatch(events: BoardEvent[]): Promise<void> {
    if (events.length === 0) return;
    const boardId = (events[0] as BoardEvent).boardId;
    try {
      const multi = this.redis.multi();
      for (const e of events) multi.zadd(logKey(boardId), e.seq, JSON.stringify(e));
      multi.zremrangebyrank(logKey(boardId), 0, -(EVENT_LOG_SIZE + 1));
      await multi.exec();
    } catch (err) {
      // 로그 기록 실패는 실시간 전달을 막지 않는다. (재연결 시 스냅샷으로 복구됨)
      this.logger.warn(`failed to append event log: ${String(err)}`);
    }
    for (const e of events) for (const l of this.listeners) l(e);
  }

  async currentSeq(boardId: string): Promise<number> {
    return Number((await this.redis.get(seqKey(boardId))) ?? 0);
  }

  /**
   * lastSeq 이후의 이벤트. 로그 범위를 벗어났으면 null (→ 스냅샷 필요).
   */
  async eventsSince(
    boardId: string,
    lastSeq: number,
  ): Promise<{ events: BoardEvent[]; seq: number } | null> {
    const [current, oldest, raw] = await Promise.all([
      this.currentSeq(boardId),
      this.redis.zrange(logKey(boardId), 0, 0, 'WITHSCORES'),
      this.redis.zrangebyscore(logKey(boardId), `(${lastSeq}`, '+inf'),
    ]);
    if (lastSeq > current) return null; // 서버 seq가 초기화된 경우
    if (lastSeq === current) return { events: [], seq: current };
    const oldestSeq = oldest[1] !== undefined ? Number(oldest[1]) : null;
    if (oldestSeq === null || oldestSeq > lastSeq + 1) return null;
    return { events: raw.map((r) => JSON.parse(r) as BoardEvent), seq: current };
  }

  async clear(boardId: string): Promise<void> {
    await this.redis.del(seqKey(boardId), logKey(boardId));
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
