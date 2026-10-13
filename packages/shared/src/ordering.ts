import {
  comparePositions,
  generateKeyBetween,
  generateNKeysBetween,
  needsRebalance,
} from './position';

export interface Positioned {
  id: string;
  position: string;
}

export interface InsertHint {
  /** 이동 후 바로 앞(위/왼쪽)에 올 항목 */
  beforeId?: string | null;
  /** 이동 후 바로 뒤(아래/오른쪽)에 올 항목 */
  afterId?: string | null;
}

export interface InsertPlan {
  position: string;
  /** 키가 너무 길어져 형제 전체를 재배치해야 할 때, 이동 항목을 포함한 id → 새 position */
  rebalance: Map<string, string> | null;
}

export function sortByPosition<T extends Positioned>(items: readonly T[]): T[] {
  return [...items].sort(
    (a, b) => comparePositions(a.position, b.position) || (a.id < b.id ? -1 : 1),
  );
}

/**
 * 형제 목록(이동 대상 제외) 안에서 hint 위치에 들어갈 position을 계산한다.
 *
 * - beforeId를 우선 기준으로 삼는다: before 바로 다음에 넣는다.
 * - beforeId가 없거나(맨 앞) 존재하지 않으면 afterId 바로 앞에 넣는다.
 * - 둘 다 없거나 찾을 수 없으면(동시 삭제 등) 맨 뒤에 넣는다.
 *
 * hint는 클라이언트가 본 화면 기준이라 서버 상태와 다를 수 있다.
 * 기준 항목 하나만 믿고 반대쪽 이웃은 서버의 실제 순서에서 다시 구하므로 항상 lo < hi가 보장된다.
 */
export function planInsert(
  siblings: readonly Positioned[],
  movingId: string,
  hint: InsertHint,
): InsertPlan {
  const sorted = sortByPosition(siblings.filter((s) => s.id !== movingId));

  let index = sorted.length; // 삽입될 인덱스 (기본: 맨 뒤)
  const beforeIdx = hint.beforeId ? sorted.findIndex((s) => s.id === hint.beforeId) : -1;
  const afterIdx = hint.afterId ? sorted.findIndex((s) => s.id === hint.afterId) : -1;
  if (beforeIdx >= 0) index = beforeIdx + 1;
  else if (afterIdx >= 0) index = afterIdx;

  const lo = sorted[index - 1]?.position ?? null;
  const hi = sorted[index]?.position ?? null;
  const position = generateKeyBetween(lo, hi);

  if (!needsRebalance(position)) return { position, rebalance: null };

  const ordered = [
    ...sorted.slice(0, index).map((s) => s.id),
    movingId,
    ...sorted.slice(index).map((s) => s.id),
  ];
  const keys = generateNKeysBetween(null, null, ordered.length);
  const rebalance = new Map(ordered.map((id, i) => [id, keys[i] as string]));
  return { position: rebalance.get(movingId) as string, rebalance };
}

/** 드롭 후 최종 순서에서 이동한 항목의 앞/뒤 이웃 id를 구한다. */
export function neighborsOf(orderedIds: readonly string[], id: string): InsertHint {
  const i = orderedIds.indexOf(id);
  if (i < 0) return { beforeId: null, afterId: null };
  return { beforeId: orderedIds[i - 1] ?? null, afterId: orderedIds[i + 1] ?? null };
}
