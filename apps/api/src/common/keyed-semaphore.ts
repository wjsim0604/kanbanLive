/**
 * 키(보드 id)별 동시 실행 수를 제한하는 비동기 세마포어. 대기 순서는 FIFO.
 * 다른 키끼리는 서로 기다리지 않는다.
 */
export class KeyedSemaphore {
  private readonly slots = new Map<string, { running: number; waiters: (() => void)[] }>();

  constructor(private readonly permits: number) {
    if (permits < 1) throw new Error('permits must be >= 1');
  }

  async run<T>(key: string, fn: () => Promise<T>): Promise<T> {
    let slot = this.slots.get(key);
    if (!slot) {
      slot = { running: 0, waiters: [] };
      this.slots.set(key, slot);
    }
    if (slot.running >= this.permits) {
      await new Promise<void>((resolve) => slot?.waiters.push(resolve));
    } else {
      slot.running++;
    }
    try {
      return await fn();
    } finally {
      const next = slot.waiters.shift();
      if (next) {
        next(); // 슬롯을 그대로 다음 대기자에게 넘긴다
      } else {
        slot.running--;
        if (slot.running === 0) this.slots.delete(key);
      }
    }
  }

  /** 현재 사용 중인 키 수 (테스트/메트릭용) */
  get size(): number {
    return this.slots.size;
  }
}
