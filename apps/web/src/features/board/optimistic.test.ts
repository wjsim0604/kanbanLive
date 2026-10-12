import { describe, expect, it } from 'vitest';
import { cardsOfList, type BoardSnapshotDto, type CardDto } from '@kanban/shared';
import { moveCardLocally, restoreCard } from './optimistic';

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
