/**
 * 문자열 기반 fractional indexing.
 *
 * rocicorp/fractional-indexing(CC0) 알고리즘을 TypeScript로 포팅했다.
 * 원본 패키지가 ESM 전용이라 CommonJS인 NestJS/Jest에서 그대로 쓸 수 없어 shared에 둔다.
 *
 * 키는 "정수부 + 소수부"로 구성된다. 정수부의 첫 글자(a~z, A~Z)가 정수부 길이를 나타내므로
 * 키 끝에 계속 붙여 나가도 사전순(코드 포인트 순) 비교만으로 순서가 유지된다.
 * DB 정렬 시 반드시 바이트 순 정렬(PostgreSQL `COLLATE "C"`)을 사용해야 한다.
 */

export const BASE_62_DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/** 이 길이를 넘는 키가 생기면 리스트를 재정렬(rebalance)한다. */
export const POSITION_REBALANCE_THRESHOLD = 32;

const ZERO = BASE_62_DIGITS[0] as string;
const LAST = BASE_62_DIGITS[BASE_62_DIGITS.length - 1] as string;
const SMALLEST_INTEGER = 'A' + ZERO.repeat(26);

function charAt(s: string, i: number): string {
  const c = s[i];
  if (c === undefined) throw new Error(`index ${i} out of range: ${s}`);
  return c;
}

function midpoint(a: string, b: string | null): string {
  if (b !== null && a >= b) throw new Error(`${a} >= ${b}`);
  if (a.slice(-1) === ZERO || (b !== null && b.slice(-1) === ZERO)) {
    throw new Error('trailing zero');
  }
  if (b !== null) {
    // 공통 접두사는 그대로 두고 나머지에서 중간값을 찾는다.
    let n = 0;
    while ((a[n] ?? ZERO) === b[n]) n++;
    if (n > 0) return b.slice(0, n) + midpoint(a.slice(n), b.slice(n));
  }
  const digitA = a ? BASE_62_DIGITS.indexOf(charAt(a, 0)) : 0;
  const digitB = b !== null ? BASE_62_DIGITS.indexOf(charAt(b, 0)) : BASE_62_DIGITS.length;
  if (digitB - digitA > 1) {
    return charAt(BASE_62_DIGITS, Math.round(0.5 * (digitA + digitB)));
  }
  if (b !== null && b.length > 1) return b.slice(0, 1);
  return charAt(BASE_62_DIGITS, digitA) + midpoint(a.slice(1), null);
}

function getIntegerLength(head: string): number {
  if (head >= 'a' && head <= 'z') return head.charCodeAt(0) - 'a'.charCodeAt(0) + 2;
  if (head >= 'A' && head <= 'Z') return 'Z'.charCodeAt(0) - head.charCodeAt(0) + 2;
  throw new Error(`invalid order key head: ${head}`);
}

function validateInteger(int: string): void {
  if (int.length !== getIntegerLength(charAt(int, 0))) {
    throw new Error(`invalid integer part of order key: ${int}`);
  }
}

function getIntegerPart(key: string): string {
  const len = getIntegerLength(charAt(key, 0));
  if (len > key.length) throw new Error(`invalid order key: ${key}`);
  return key.slice(0, len);
}

function validateOrderKey(key: string): void {
  if (key === SMALLEST_INTEGER) throw new Error(`invalid order key: ${key}`);
  const i = getIntegerPart(key);
  const f = key.slice(i.length);
  if (f.slice(-1) === ZERO) throw new Error(`invalid order key: ${key}`);
  for (const c of key) {
    if (!BASE_62_DIGITS.includes(c)) throw new Error(`invalid order key: ${key}`);
  }
}

function incrementInteger(x: string): string | null {
  validateInteger(x);
  const head = charAt(x, 0);
  const digs = x.slice(1).split('');
  let carry = true;
  for (let i = digs.length - 1; carry && i >= 0; i--) {
    const d = BASE_62_DIGITS.indexOf(charAt(digs.join(''), i)) + 1;
    if (d === BASE_62_DIGITS.length) {
      digs[i] = ZERO;
    } else {
      digs[i] = charAt(BASE_62_DIGITS, d);
      carry = false;
    }
  }
  if (!carry) return head + digs.join('');
  if (head === 'Z') return 'a' + ZERO;
  if (head === 'z') return null;
  const h = String.fromCharCode(head.charCodeAt(0) + 1);
  if (h > 'a') digs.push(ZERO);
  else digs.pop();
  return h + digs.join('');
}

function decrementInteger(x: string): string | null {
  validateInteger(x);
  const head = charAt(x, 0);
  const digs = x.slice(1).split('');
  let borrow = true;
  for (let i = digs.length - 1; borrow && i >= 0; i--) {
    const d = BASE_62_DIGITS.indexOf(charAt(digs.join(''), i)) - 1;
    if (d === -1) {
      digs[i] = LAST;
    } else {
      digs[i] = charAt(BASE_62_DIGITS, d);
      borrow = false;
    }
  }
  if (!borrow) return head + digs.join('');
  if (head === 'a') return 'Z' + LAST;
  if (head === 'A') return null;
  const h = String.fromCharCode(head.charCodeAt(0) - 1);
  if (h < 'Z') digs.push(LAST);
  else digs.pop();
  return h + digs.join('');
}

/**
 * a < key < b 를 만족하는 키를 만든다. a가 null이면 맨 앞, b가 null이면 맨 뒤.
 */
export function generateKeyBetween(a: string | null, b: string | null): string {
  if (a !== null) validateOrderKey(a);
  if (b !== null) validateOrderKey(b);
  if (a !== null && b !== null && a >= b) throw new Error(`${a} >= ${b}`);

  if (a === null) {
    if (b === null) return 'a' + ZERO;
    const ib = getIntegerPart(b);
    const fb = b.slice(ib.length);
    if (ib === SMALLEST_INTEGER) return ib + midpoint('', fb);
    if (ib < b) return ib;
    const res = decrementInteger(ib);
    if (res === null) throw new Error('cannot decrement any more');
    return res;
  }

  if (b === null) {
    const ia = getIntegerPart(a);
    const fa = a.slice(ia.length);
    const i = incrementInteger(ia);
    return i === null ? ia + midpoint(fa, null) : i;
  }

  const ia = getIntegerPart(a);
  const fa = a.slice(ia.length);
  const ib = getIntegerPart(b);
  const fb = b.slice(ib.length);
  if (ia === ib) return ia + midpoint(fa, fb);
  const i = incrementInteger(ia);
  if (i === null) throw new Error('cannot increment any more');
  if (i < b) return i;
  return ia + midpoint(fa, null);
}

/** a와 b 사이에 균등하게 분포된 n개의 키를 만든다. (rebalance, 시드 데이터용) */
export function generateNKeysBetween(a: string | null, b: string | null, n: number): string[] {
  if (n === 0) return [];
  if (n === 1) return [generateKeyBetween(a, b)];
  if (b === null) {
    let c = generateKeyBetween(a, b);
    const result = [c];
    for (let i = 0; i < n - 1; i++) {
      c = generateKeyBetween(c, b);
      result.push(c);
    }
    return result;
  }
  if (a === null) {
    let c = generateKeyBetween(a, b);
    const result = [c];
    for (let i = 0; i < n - 1; i++) {
      c = generateKeyBetween(a, c);
      result.push(c);
    }
    return result.reverse();
  }
  const mid = Math.floor(n / 2);
  const c = generateKeyBetween(a, b);
  return [...generateNKeysBetween(a, c, mid), c, ...generateNKeysBetween(c, b, n - mid - 1)];
}

/** DB collation과 무관하게 코드 포인트 순으로 비교한다. */
export function comparePositions(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function needsRebalance(key: string): boolean {
  return key.length > POSITION_REBALANCE_THRESHOLD;
}
