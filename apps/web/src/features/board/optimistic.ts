import {
  cardsOfList,
  planInsert,
  sortByPosition,
  type BoardSnapshotDto,
  type CardDto,
  type InsertHint,
  type ListDto,
} from '@kanban/shared';

/**
 * 낙관적 업데이트용 순수 함수들.
 * 서버와 같은 planInsert로 위치를 계산하므로, 대부분의 경우 서버 확정 결과와 동일한 순서가 된다.
 * version은 올리지 않는다. 서버 확정 이벤트(version + 1)가 오면 그것으로 덮어써진다.
 */

export function moveCardLocally(
  s: BoardSnapshotDto,
  cardId: string,
  toListId: string,
  hint: InsertHint,
): BoardSnapshotDto {
  const card = s.cards.find((c) => c.id === cardId);
  if (!card) return s;
  const plan = planInsert(cardsOfList(s, toListId), cardId, hint);
  const rebalance = plan.rebalance;
  const cards = s.cards.map((c): CardDto => {
    if (c.id === cardId) return { ...c, listId: toListId, position: plan.position };
    const p = rebalance?.get(c.id);
    return p ? { ...c, position: p } : c;
  });
  return { ...s, cards: sortByPosition(cards) };
}

export function moveListLocally(
  s: BoardSnapshotDto,
  listId: string,
  hint: InsertHint,
): BoardSnapshotDto {
  const plan = planInsert(s.lists, listId, hint);
  const lists = s.lists.map((l): ListDto => {
    if (l.id === listId) return { ...l, position: plan.position };
    const p = plan.rebalance?.get(l.id);
    return p ? { ...l, position: p } : l;
  });
  return { ...s, lists: sortByPosition(lists) };
}

/** 실패 시 롤백: 그 사이 서버 이벤트로 카드가 갱신되지 않았을 때만 이전 상태로 되돌린다. */
export function restoreCard(s: BoardSnapshotDto, previous: CardDto): BoardSnapshotDto {
  const current = s.cards.find((c) => c.id === previous.id);
  if (current && current.version !== previous.version) return s;
  const others = s.cards.filter((c) => c.id !== previous.id);
  return { ...s, cards: sortByPosition([...others, previous]) };
}

export function restoreList(s: BoardSnapshotDto, previous: ListDto): BoardSnapshotDto {
  const current = s.lists.find((l) => l.id === previous.id);
  if (current && current.version !== previous.version) return s;
  const others = s.lists.filter((l) => l.id !== previous.id);
  return { ...s, lists: sortByPosition([...others, previous]) };
}

export interface CardPatch {
  title?: string;
  description?: string;
  assigneeId?: string | null;
  dueDate?: string | null;
}

/** 필드 수정의 낙관적 반영. dueDate는 'YYYY-MM-DD'를 ISO로 맞춘다. */
export function patchCardLocally(
  s: BoardSnapshotDto,
  cardId: string,
  patch: CardPatch,
): BoardSnapshotDto {
  return {
    ...s,
    cards: s.cards.map((c) => {
      if (c.id !== cardId) return c;
      const next: CardDto = { ...c };
      if (patch.title !== undefined) next.title = patch.title;
      if (patch.description !== undefined) next.description = patch.description;
      if (patch.assigneeId !== undefined) next.assigneeId = patch.assigneeId;
      if (patch.dueDate !== undefined)
        next.dueDate = patch.dueDate ? new Date(patch.dueDate).toISOString() : null;
      return next;
    }),
  };
}
