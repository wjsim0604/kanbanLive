import { describe, expect, it } from 'vitest';
import { cardsOfList, type BoardSnapshotDto, type CardDto } from '@kanban/shared';
import { applyBoardEvent, type BoardEvent } from '@kanban/shared';
import { moveCardLocally, patchCardLocally, restoreCard } from './optimistic';

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

const state = (): BoardSnapshotDto => ({
  board: { id: 'b', title: 'B', ownerId: 'u', createdAt: '', updatedAt: '' },
  role: 'OWNER',
  members: [],
  lists: [],
  cards: [card('a', 'L1', 'a0'), card('b', 'L1', 'a1'), card('c', 'L2', 'a0')],
  seq: 0,
});

describe('moveCardLocally', () => {
  it('다른 리스트의 지정 위치로 옮긴다 (version은 유지)', () => {
    const s = moveCardLocally(state(), 'a', 'L2', { beforeId: null, afterId: 'c' });
    expect(cardsOfList(s, 'L2').map((c) => c.id)).toEqual(['a', 'c']);
    expect(cardsOfList(s, 'L1').map((c) => c.id)).toEqual(['b']);
    expect(s.cards.find((c) => c.id === 'a')?.version).toBe(1);
  });
});

describe('restoreCard', () => {
  it('실패 시 이전 상태로 되돌린다', () => {
    const before = state();
    const moved = moveCardLocally(before, 'a', 'L2', {});
    const restored = restoreCard(moved, before.cards[0] as CardDto);
    expect(cardsOfList(restored, 'L1').map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('그 사이 서버 이벤트로 카드가 갱신되었으면(version 변경) 되돌리지 않는다', () => {
    const before = state();
    const remote = { ...state(), cards: [card('a', 'L2', 'a5', 2), ...state().cards.slice(1)] };
    const restored = restoreCard(remote, before.cards[0] as CardDto);
    expect(restored.cards.find((c) => c.id === 'a')).toMatchObject({ listId: 'L2', version: 2 });
  });
});

describe('patchCardLocally', () => {
  it('지정한 필드만 바꾸고 version은 유지한다', () => {
    const s = patchCardLocally(state(), 'a', { title: '새 제목', dueDate: '2026-12-31' });
    expect(s.cards[0]).toMatchObject({ title: '새 제목', version: 1, description: '' });
    expect(s.cards[0]?.dueDate).toMatch(/^2026-12-31/);
  });
});

describe('낙관적 업데이트 + 원격 이벤트 + 내 응답의 도착 순서와 무관하게 서버 상태로 수렴', () => {
  const event = (c: CardDto, seq: number): BoardEvent => ({
    type: 'card:moved',
    payload: { card: c, fromListId: 'L1' },
    seq,
    boardId: 'b',
    actorId: 'x',
    at: '',
  });
  // 서버에서는 다른 사용자의 이동(v2)이 먼저, 내 이동(v3)이 나중에 커밋되었다.
  const remote = card('a', 'L2', 'a5', 2);
  const mine = card('a', 'L1', 'Zz', 3);
  const upsert = (s: BoardSnapshotDto, c: CardDto, seq: number) =>
    applyBoardEvent(s, event(c, seq));

  it('원격 이벤트 → 내 응답', () => {
    let s = moveCardLocally(state(), 'a', 'L1', { beforeId: null, afterId: 'b' });
    s = upsert(s, remote, 1);
    s = upsert(s, mine, 2);
    expect(s.cards.find((c) => c.id === 'a')).toMatchObject({ listId: 'L1', version: 3 });
  });

  it('내 응답 → (늦게 도착한) 원격 이벤트', () => {
    let s = moveCardLocally(state(), 'a', 'L1', { beforeId: null, afterId: 'b' });
    s = upsert(s, mine, 2);
    s = upsert(s, remote, 1);
    expect(s.cards.find((c) => c.id === 'a')).toMatchObject({ listId: 'L1', version: 3 });
  });

  it('원격 이벤트가 낙관적 상태보다 먼저 와도 내 확정 결과가 최종', () => {
    let s = upsert(state(), remote, 1);
    s = moveCardLocally(s, 'a', 'L1', { beforeId: null, afterId: 'b' });
    s = upsert(s, mine, 2);
    expect(s.cards.find((c) => c.id === 'a')).toMatchObject({
      listId: 'L1',
      position: 'Zz',
      version: 3,
    });
  });
});
