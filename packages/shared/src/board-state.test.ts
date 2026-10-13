import { describe, expect, it } from 'vitest';
import { applyBoardEvent, EventSequencer, upsertCard } from './board-state';
import type { BoardSnapshotDto, CardDto, ListDto } from './domain';
import type { BoardEvent, BoardEventInput } from './events';

const list = (id: string, position: string, version = 1): ListDto => ({
  id,
  boardId: 'b',
  title: id,
  position,
  version,
  createdAt: '',
});

const card = (id: string, listId: string, position: string, version = 1): CardDto => ({
  id,
  boardId: 'b',
  listId,
  title: id,
  description: '',
  position,
  assigneeId: null,
  dueDate: null,
  version,
  commentCount: 0,
  createdAt: '',
  updatedAt: '',
});

const snapshot = (): BoardSnapshotDto => ({
  board: { id: 'b', title: 'B', ownerId: 'u', createdAt: '', updatedAt: '' },
  role: 'OWNER',
  members: [],
  lists: [list('L1', 'a0'), list('L2', 'a1')],
  cards: [card('c1', 'L1', 'a0'), card('c2', 'L1', 'a1')],
  seq: 10,
});

let seq = 10;
const ev = (input: BoardEventInput, s = ++seq): BoardEvent =>
  ({ ...input, seq: s, boardId: 'b', actorId: 'u', at: '' }) as BoardEvent;

describe('applyBoardEvent', () => {
  it('card:moved 는 더 큰 version일 때만 반영된다', () => {
    const s = snapshot();
    const moved = applyBoardEvent(
      s,
      ev({ type: 'card:moved', payload: { card: card('c1', 'L2', 'a0', 2), fromListId: 'L1' } }),
    );
    expect(moved.cards.find((c) => c.id === 'c1')).toMatchObject({ listId: 'L2', version: 2 });

    const stale = applyBoardEvent(
      moved,
      ev({ type: 'card:updated', payload: { card: card('c1', 'L1', 'a0', 2) } }),
    );
    expect(stale.cards.find((c) => c.id === 'c1')).toMatchObject({ listId: 'L2' });
  });

  it('authoritative upsert는 같은 version이어도 덮어쓴다 (충돌 응답으로 낙관적 변경 폐기)', () => {
    const dirty = { ...snapshot(), cards: [{ ...card('c1', 'L1', 'a0', 2), title: 'local edit' }] };
    const server = { ...card('c1', 'L1', 'a0', 2), title: 'server' };
    expect(upsertCard(dirty, server).cards[0]?.title).toBe('local edit');
    expect(upsertCard(dirty, server, true).cards[0]?.title).toBe('server');
    expect(upsertCard(dirty, { ...server, version: 1 }, true).cards[0]?.title).toBe('local edit');
  });

  it('같은 이벤트를 두 번 적용해도 결과가 같다 (멱등)', () => {
    const e = ev({ type: 'card:created', payload: { card: card('c3', 'L2', 'a0') } });
    const once = applyBoardEvent(snapshot(), e);
    expect(applyBoardEvent(once, e)).toEqual(once);
  });

  it('list:deleted 는 소속 카드도 제거한다', () => {
    const s = applyBoardEvent(snapshot(), ev({ type: 'list:deleted', payload: { listId: 'L1' } }));
    expect(s.lists.map((l) => l.id)).toEqual(['L2']);
    expect(s.cards).toHaveLength(0);
  });

  it('positions:rebalanced 는 version이 큰 항목의 position을 갱신하고 정렬한다', () => {
    const s = applyBoardEvent(
      snapshot(),
      ev({
        type: 'positions:rebalanced',
        payload: { kind: 'card', items: [{ id: 'c1', position: 'a5', version: 2 }] },
      }),
    );
    expect(s.cards.map((c) => c.id)).toEqual(['c2', 'c1']);
  });

  it('seq를 갱신한다', () => {
    const e = ev({ type: 'card:deleted', payload: { cardId: 'c1', listId: 'L1' } }, 42);
    expect(applyBoardEvent(snapshot(), e).seq).toBe(42);
  });
});

describe('EventSequencer', () => {
  const e = (s: number) =>
    ev({ type: 'card:deleted', payload: { cardId: `x${s}`, listId: 'L' } }, s);

  it('순서대로 오면 바로 내보낸다', () => {
    const q = new EventSequencer(10);
    expect(q.push(e(11)).map((x) => x.seq)).toEqual([11]);
    expect(q.push(e(12)).map((x) => x.seq)).toEqual([12]);
    expect(q.lastSeq).toBe(12);
  });

  it('순서가 뒤바뀌면 버퍼링했다가 공백이 메워지면 순서대로 내보낸다', () => {
    const q = new EventSequencer(10);
    expect(q.push(e(12))).toEqual([]);
    expect(q.hasGap).toBe(true);
    expect(q.push(e(11)).map((x) => x.seq)).toEqual([11, 12]);
    expect(q.hasGap).toBe(false);
  });

  it('이미 반영된 seq(스냅샷 이전)는 버린다', () => {
    const q = new EventSequencer(10);
    expect(q.push(e(9))).toEqual([]);
    expect(q.push(e(10))).toEqual([]);
  });

  it('advanceTo: 롤백으로 비어 있는 seq를 건너뛴다', () => {
    const q = new EventSequencer(10);
    q.push(e(13));
    // 11, 12는 영원히 오지 않음 (롤백). sync 결과 서버 seq = 13
    expect(q.advanceTo(13).map((x) => x.seq)).toEqual([13]);
    expect(q.lastSeq).toBe(13);
    expect(q.push(e(14)).map((x) => x.seq)).toEqual([14]);
  });
});
