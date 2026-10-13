import type { BoardSnapshotDto, CardDto, ListDto } from './domain';
import type { BoardEvent } from './events';
import { sortByPosition } from './ordering';

/**
 * 클라이언트 보드 상태 리듀서 (순수 함수).
 *
 * 카드/리스트는 version이 더 큰 쪽만 반영한다(last-write-wins by version).
 * - 내가 보낸 변경의 REST 응답과 브로드캐스트 이벤트가 둘 다 와도 한 번만 반영된다 (멱등).
 * - 낙관적 업데이트로 바뀐 로컬 상태는 서버 확정 이벤트(version + 1)로 덮어써진다.
 */
export function applyBoardEvent(state: BoardSnapshotDto, event: BoardEvent): BoardSnapshotDto {
  const next = reduce(state, event);
  return next === state && event.seq <= state.seq
    ? state
    : { ...next, seq: Math.max(next.seq, event.seq) };
}

function reduce(s: BoardSnapshotDto, e: BoardEvent): BoardSnapshotDto {
  switch (e.type) {
    case 'card:created':
    case 'card:updated':
    case 'card:moved':
      return upsertCard(s, e.payload.card);
    case 'card:deleted':
      return { ...s, cards: s.cards.filter((c) => c.id !== e.payload.cardId) };
    case 'list:created':
    case 'list:updated':
    case 'list:moved':
      return upsertList(s, e.payload.list);
    case 'list:deleted':
      return {
        ...s,
        lists: s.lists.filter((l) => l.id !== e.payload.listId),
        cards: s.cards.filter((c) => c.listId !== e.payload.listId),
      };
    case 'positions:rebalanced': {
      const byId = new Map(e.payload.items.map((i) => [i.id, i]));
      const patch = <T extends CardDto | ListDto>(x: T): T => {
        const p = byId.get(x.id);
        return p && p.version > x.version ? { ...x, position: p.position, version: p.version } : x;
      };
      return e.payload.kind === 'card'
        ? { ...s, cards: sortByPosition(s.cards.map(patch)) }
        : { ...s, lists: sortByPosition(s.lists.map(patch)) };
    }
    case 'comment:added':
      return {
        ...s,
        cards: s.cards.map((c) =>
          c.id === e.payload.comment.cardId ? { ...c, commentCount: e.payload.commentCount } : c,
        ),
      };
    case 'member:added':
    case 'member:updated': {
      const m = e.payload.member;
      const exists = s.members.some((x) => x.user.id === m.user.id);
      return {
        ...s,
        members: exists
          ? s.members.map((x) => (x.user.id === m.user.id ? m : x))
          : [...s.members, m],
      };
    }
    case 'member:removed':
      return { ...s, members: s.members.filter((m) => m.user.id !== e.payload.userId) };
    case 'board:updated':
      return { ...s, board: e.payload.board };
    case 'board:deleted':
      return s;
  }
}

/**
 * @param authoritative true면 version이 같아도 덮어쓴다.
 *   낙관적 수정은 version을 올리지 않으므로, 같은 version의 로컬 카드에는 확정되지 않은 변경이 섞여 있을 수 있다.
 *   서버가 "이것이 현재 상태"라고 알려준 경우(409 충돌 응답 등)에는 그 값을 그대로 채택한다.
 */
export function upsertCard(
  s: BoardSnapshotDto,
  card: CardDto,
  authoritative = false,
): BoardSnapshotDto {
  const existing = s.cards.find((c) => c.id === card.id);
  if (
    existing &&
    (authoritative ? existing.version > card.version : existing.version >= card.version)
  )
    return s;
  const others = s.cards.filter((c) => c.id !== card.id);
  return { ...s, cards: sortByPosition([...others, card]) };
}

export function upsertList(s: BoardSnapshotDto, list: ListDto): BoardSnapshotDto {
  const existing = s.lists.find((l) => l.id === list.id);
  if (existing && existing.version >= list.version) return s;
  const others = s.lists.filter((l) => l.id !== list.id);
  return { ...s, lists: sortByPosition([...others, list]) };
}

export function cardsOfList(s: Pick<BoardSnapshotDto, 'cards'>, listId: string): CardDto[] {
  return sortByPosition(s.cards.filter((c) => c.listId === listId));
}

/**
 * seq 순서대로 이벤트를 내보낸다.
 * - seq <= lastSeq: 이미 반영됨 → 버림
 * - seq == lastSeq + 1: 즉시 내보내고, 이어지는 버퍼도 함께 내보냄
 * - 그 외: 버퍼에 보관 (hasGap → 호출 측이 잠시 기다린 뒤 sync 요청)
 */
export class EventSequencer {
  private buffer = new Map<number, BoardEvent>();

  constructor(private last: number) {}

  get lastSeq(): number {
    return this.last;
  }

  get hasGap(): boolean {
    return this.buffer.size > 0;
  }

  push(event: BoardEvent): BoardEvent[] {
    if (event.seq <= this.last) return [];
    this.buffer.set(event.seq, event);
    return this.drain();
  }

  /** sync 응답 처리 후: seq까지는 빈 번호(롤백된 트랜잭션)가 있어도 건너뛴다. */
  advanceTo(seq: number): BoardEvent[] {
    const released: BoardEvent[] = [];
    for (const s of [...this.buffer.keys()].sort((a, b) => a - b)) {
      if (s > seq) break;
      released.push(this.buffer.get(s) as BoardEvent);
      this.buffer.delete(s);
    }
    this.last = Math.max(this.last, seq);
    return [...released, ...this.drain()];
  }

  reset(seq: number): void {
    this.last = seq;
    for (const s of [...this.buffer.keys()]) if (s <= seq) this.buffer.delete(s);
  }

  private drain(): BoardEvent[] {
    const out: BoardEvent[] = [];
    let nextEvent = this.buffer.get(this.last + 1);
    while (nextEvent) {
      out.push(nextEvent);
      this.buffer.delete(nextEvent.seq);
      this.last = nextEvent.seq;
      nextEvent = this.buffer.get(this.last + 1);
    }
    return out;
  }
}
