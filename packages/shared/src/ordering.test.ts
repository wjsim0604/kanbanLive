import { describe, expect, it } from 'vitest';
import { neighborsOf, planInsert, sortByPosition, type Positioned } from './ordering';
import { generateKeyBetween, generateNKeysBetween } from './position';

const items = (n: number): Positioned[] =>
  generateNKeysBetween(null, null, n).map((position, i) => ({ id: `c${i}`, position }));

const orderAfter = (list: Positioned[], movingId: string, position: string) =>
  sortByPosition([...list.filter((c) => c.id !== movingId), { id: movingId, position }]).map(
    (c) => c.id,
  );

describe('planInsert', () => {
  const list = items(4); // c0 c1 c2 c3

  it('빈 리스트에는 첫 키를 만든다', () => {
    expect(planInsert([], 'x', {}).position).toBe('a0');
  });

  it('beforeId 바로 다음에 넣는다', () => {
    const plan = planInsert(list, 'x', { beforeId: 'c1', afterId: 'c2' });
    expect(orderAfter(list, 'x', plan.position)).toEqual(['c0', 'c1', 'x', 'c2', 'c3']);
  });

  it('beforeId가 null이면 afterId 앞(맨 앞)에 넣는다', () => {
    const plan = planInsert(list, 'x', { beforeId: null, afterId: 'c0' });
    expect(orderAfter(list, 'x', plan.position)).toEqual(['x', 'c0', 'c1', 'c2', 'c3']);
  });

  it('hint가 없으면 맨 뒤에 넣는다', () => {
    const plan = planInsert(list, 'x', {});
    expect(orderAfter(list, 'x', plan.position)).toEqual(['c0', 'c1', 'c2', 'c3', 'x']);
  });

  it('같은 리스트 안에서 아래로 이동 (자기 자신은 제외하고 계산)', () => {
    const plan = planInsert(list, 'c0', { beforeId: 'c2', afterId: 'c3' });
    expect(orderAfter(list, 'c0', plan.position)).toEqual(['c1', 'c2', 'c0', 'c3']);
  });

  it('hint가 서로 맞지 않으면(stale) beforeId를 기준으로 서버 순서에서 이웃을 다시 구한다', () => {
    // 클라이언트는 c0 다음, c3 앞이라고 생각하지만 서버에서는 c0 다음이 c1이다.
    const plan = planInsert(list, 'x', { beforeId: 'c0', afterId: 'c3' });
    expect(orderAfter(list, 'x', plan.position)).toEqual(['c0', 'x', 'c1', 'c2', 'c3']);
  });

  it('beforeId가 삭제되어 없으면 afterId 기준으로 넣는다', () => {
    const plan = planInsert(list, 'x', { beforeId: 'deleted', afterId: 'c2' });
    expect(orderAfter(list, 'x', plan.position)).toEqual(['c0', 'c1', 'x', 'c2', 'c3']);
  });

  it('둘 다 존재하지 않으면 맨 뒤에 넣는다', () => {
    const plan = planInsert(list, 'x', { beforeId: 'gone1', afterId: 'gone2' });
    expect(orderAfter(list, 'x', plan.position)).toEqual(['c0', 'c1', 'c2', 'c3', 'x']);
  });

  it('간격이 너무 좁아지면 rebalance 계획을 함께 돌려준다', () => {
    // a0 과 그 바로 뒤 키 사이에 계속 끼워 넣어 키를 길게 만든다
    let tight: Positioned[] = [
      { id: 'a', position: 'a0' },
      { id: 'b', position: 'a1' },
    ];
    let plan = planInsert(tight, 'x0', { beforeId: 'a', afterId: 'b' });
    for (let i = 1; plan.rebalance === null && i < 500; i++) {
      tight = [...tight, { id: `x${i - 1}`, position: plan.position }];
      plan = planInsert(tight, `x${i}`, { beforeId: 'a', afterId: `x${i - 1}` });
    }
    expect(plan.rebalance).not.toBeNull();
    const rebalance = plan.rebalance as Map<string, string>;
    expect(rebalance.size).toBe(tight.length + 1);
    const reordered = sortByPosition([...rebalance].map(([id, position]) => ({ id, position })));
    expect(reordered.map((c) => c.id).slice(0, 2)).toEqual(['a', `x${tight.length - 2}`]);
    expect([...rebalance.values()].every((p) => p.length <= 3)).toBe(true);
  });

  it('생성된 키는 항상 lo < key < hi', () => {
    const lo = generateKeyBetween(null, null);
    const hi = generateKeyBetween(lo, null);
    const plan = planInsert(
      [
        { id: 'l', position: lo },
        { id: 'h', position: hi },
      ],
      'x',
      { beforeId: 'l' },
    );
    expect(plan.position > lo && plan.position < hi).toBe(true);
  });
});

describe('neighborsOf', () => {
  it('앞/뒤 이웃을 구한다', () => {
    expect(neighborsOf(['a', 'b', 'c'], 'b')).toEqual({ beforeId: 'a', afterId: 'c' });
    expect(neighborsOf(['a', 'b', 'c'], 'a')).toEqual({ beforeId: null, afterId: 'b' });
    expect(neighborsOf(['a'], 'a')).toEqual({ beforeId: null, afterId: null });
  });
});
