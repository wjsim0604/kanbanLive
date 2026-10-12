import { KeyedSemaphore } from './keyed-semaphore';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('KeyedSemaphore', () => {
  const probe = (sem: KeyedSemaphore, key: string) => {
    const state = { running: 0, max: 0, order: [] as string[] };
    const task = (name: string, ms: number) =>
      sem.run(key, async () => {
        state.running++;
        state.max = Math.max(state.max, state.running);
        state.order.push(name);
        await sleep(ms);
        state.running--;
        return name;
      });
    return { state, task };
  };

  it('permits=1이면 같은 키의 작업이 한 번에 하나씩, 들어온 순서대로 실행된다', async () => {
    const { state, task } = probe(new KeyedSemaphore(1), 'board');
    const results = await Promise.all([task('a', 15), task('b', 5), task('c', 1)]);
    expect(results).toEqual(['a', 'b', 'c']);
    expect(state.max).toBe(1);
    expect(state.order).toEqual(['a', 'b', 'c']);
  });

  it('permits=2이면 같은 키에서 최대 2개까지 동시에 실행된다', async () => {
    const { state, task } = probe(new KeyedSemaphore(2), 'board');
    await Promise.all(['a', 'b', 'c', 'd', 'e'].map((n) => task(n, 5)));
    expect(state.max).toBe(2);
    expect(state.order).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('다른 키끼리는 서로 기다리지 않는다', async () => {
    const sem = new KeyedSemaphore(1);
    const started: string[] = [];
    const slow = sem.run('A', async () => {
      started.push('A');
      await sleep(30);
    });
    await sleep(1);
    await sem.run('B', async () => {
      started.push('B');
    });
    expect(started).toEqual(['A', 'B']);
    await slow;
  });

  it('작업이 실패해도 다음 작업이 실행되고 키가 정리된다', async () => {
    const sem = new KeyedSemaphore(1);
    const failing = sem.run('k', async () => {
      throw new Error('boom');
    });
    const next = sem.run('k', async () => 'ok');
    await expect(failing).rejects.toThrow('boom');
    await expect(next).resolves.toBe('ok');
    expect(sem.size).toBe(0);
  });
});
