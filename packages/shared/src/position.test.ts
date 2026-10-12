import { describe, expect, it } from 'vitest';
import {
  comparePositions,
  generateKeyBetween,
  generateNKeysBetween,
  needsRebalance,
} from './position';

describe('generateKeyBetween', () => {
  it('빈 리스트의 첫 키는 a0', () => {
    expect(generateKeyBetween(null, null)).toBe('a0');
  });

  it('맨 뒤/맨 앞/사이에 끼워 넣어도 순서가 유지된다', () => {
    const a = generateKeyBetween(null, null);
    const after = generateKeyBetween(a, null);
    const before = generateKeyBetween(null, a);
    const mid = generateKeyBetween(a, after);
    expect([after, mid, before, a].sort(comparePositions)).toEqual([before, a, mid, after]);
  });

  it('알려진 값 (원본 구현과 동일)', () => {
    expect(generateKeyBetween('a0', null)).toBe('a1');
    expect(generateKeyBetween('a0', 'a1')).toBe('a0V');
    expect(generateKeyBetween(null, 'a0')).toBe('Zz');
    expect(generateKeyBetween('Zz', 'a0')).toBe('ZzV');
    expect(generateKeyBetween('a1', 'a2')).toBe('a1V');
    expect(generateKeyBetween('az', null)).toBe('b00');
  });

  it('a >= b 이면 에러', () => {
    expect(() => generateKeyBetween('a1', 'a0')).toThrow();
    expect(() => generateKeyBetween('a1', 'a1')).toThrow();
  });

  it('같은 지점에 반복 삽입해도 항상 사이 값이 나온다 (키 길이는 증가)', () => {
    let lo = 'a0';
    const hi = 'a1';
    for (let i = 0; i < 200; i++) {
      const k = generateKeyBetween(lo, hi);
      expect(k > lo && k < hi).toBe(true);
      lo = k;
    }
    expect(needsRebalance(lo)).toBe(true);
  });

  it('무작위 삽입 1000회에서도 정렬 불변식이 유지된다', () => {
    const keys: string[] = [];
    let seed = 42;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed / 2 ** 31;
    };
    for (let i = 0; i < 1000; i++) {
      const idx = Math.floor(rand() * (keys.length + 1));
      const k = generateKeyBetween(keys[idx - 1] ?? null, keys[idx] ?? null);
      keys.splice(idx, 0, k);
    }
    expect([...keys].sort(comparePositions)).toEqual(keys);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('generateNKeysBetween', () => {
  it('n개의 정렬된 고유 키를 만든다', () => {
    const keys = generateNKeysBetween(null, null, 50);
    expect(keys).toHaveLength(50);
    expect([...keys].sort(comparePositions)).toEqual(keys);
    expect(keys.every((k) => k.length <= 3)).toBe(true);
  });

  it('두 키 사이에 n개를 만든다', () => {
    const keys = generateNKeysBetween('a0', 'a1', 10);
    expect(keys.every((k) => k > 'a0' && k < 'a1')).toBe(true);
    expect([...keys].sort(comparePositions)).toEqual(keys);
  });
});
