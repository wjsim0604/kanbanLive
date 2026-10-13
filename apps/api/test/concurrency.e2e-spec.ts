import request from 'supertest';
import {
  applyBoardEvent,
  cardsOfList,
  EventSequencer,
  type BoardEvent,
  type BoardSnapshotDto,
  type BoardSummaryDto,
  type CardDto,
  type ListDto,
} from '@kanban/shared';
import {
  createBoard,
  createTestApp,
  getSnapshot,
  signup,
  type TestApp,
  type TestUser,
} from './helpers';
import { connect, emitAck, listen, Recorder, type ClientSocket } from './socket-helpers';

/**
 * 동시성 시나리오. 여러 클라이언트가 같은 보드를 동시에 조작해도
 * (1) DB 상태가 일관되고 (2) 이벤트를 받은 모든 클라이언트가 DB와 같은 상태로 수렴하는지 검증한다.
 */
describe('Concurrency (e2e)', () => {
  let app: TestApp;
  let url: string;
  let alice: TestUser;
  let bob: TestUser;
  let board: BoardSummaryDto;
  let lists: [ListDto, ListDto, ListDto];
  const sockets: ClientSocket[] = [];

  const http = () => request(app.getHttpServer());
  const createCard = async (listId: string, title: string) =>
    (await http().post(`/api/lists/${listId}/cards`).set(alice.auth).send({ title }).expect(201))
      .body as CardDto;

  /** 클라이언트 시뮬레이션: 스냅샷 + 수신 이벤트를 seq 순서대로 리듀서에 적용 */
  async function observer(user: TestUser) {
    const socket = await connect(url, user.accessToken);
    sockets.push(socket);
    const rec = new Recorder(socket);
    await emitAck(socket, 'board:join', { boardId: board.id });
    const initial = await getSnapshot(app, user, board.id);
    return {
      rec,
      /** 지금까지 받은 이벤트를 적용한 클라이언트 상태 */
      state(): BoardSnapshotDto {
        const seq = new EventSequencer(initial.seq);
        const ordered: BoardEvent[] = [];
        for (const e of rec.events) ordered.push(...seq.push(e));
        return ordered.reduce(applyBoardEvent, initial);
      },
    };
  }

  const comparable = (s: BoardSnapshotDto) => ({
    lists: s.lists.map((l) => ({ id: l.id, position: l.position, version: l.version })),
    cards: s.cards.map((c) => ({
      id: c.id,
      listId: c.listId,
      position: c.position,
      version: c.version,
      title: c.title,
    })),
  });

  beforeAll(async () => {
    app = await createTestApp();
    url = await listen(app);
    [alice, bob] = await Promise.all([signup(app, 'Alice'), signup(app, 'Bob')]);
  });

  beforeEach(async () => {
    board = await createBoard(app, alice, 'Concurrency');
    await http()
      .post(`/api/boards/${board.id}/members`)
      .set(alice.auth)
      .send({ email: bob.user.email })
      .expect(201);
    lists = (await getSnapshot(app, alice, board.id)).lists as [ListDto, ListDto, ListDto];
  });

  afterEach(() => {
    while (sockets.length) sockets.pop()?.close();
  });
  afterAll(() => app.close());

  it('같은 카드를 두 사용자가 동시에 다른 리스트로 옮기면 둘 다 성공하고(last-write-wins) 모두 같은 상태로 수렴한다', async () => {
    const card = await createCard(lists[0].id, 'contested');
    const watcherA = await observer(alice);
    const watcherB = await observer(bob);

    const [r1, r2] = await Promise.all([
      http().post(`/api/cards/${card.id}/move`).set(alice.auth).send({ toListId: lists[1].id }),
      http().post(`/api/cards/${card.id}/move`).set(bob.auth).send({ toListId: lists[2].id }),
    ]);
    expect([r1.status, r2.status]).toEqual([200, 200]);
    // 보드 잠금으로 직렬화되므로 두 이동의 version은 2, 3으로 구분된다
    expect([(r1.body as CardDto).version, (r2.body as CardDto).version].sort()).toEqual([2, 3]);
    const winner = [r1.body as CardDto, r2.body as CardDto].find((c) => c.version === 3) as CardDto;

    const final = await getSnapshot(app, alice, board.id);
    expect(final.cards.find((c) => c.id === card.id)?.listId).toBe(winner.listId);

    for (const w of [watcherA, watcherB]) {
      await w.rec.waitFor(() => (w.state().seq >= final.seq ? true : undefined));
      expect(comparable(w.state())).toEqual(comparable(final));
    }
  });

  it('여러 사용자가 같은 두 카드 사이에 동시에 카드를 넣어도 position이 중복되지 않는다', async () => {
    const top = await createCard(lists[0].id, 'top');
    const bottom = await createCard(lists[0].id, 'bottom');
    const movers = await Promise.all(
      Array.from({ length: 8 }, (_, i) => createCard(lists[1].id, `m${i}`)),
    );
    const watcher = await observer(bob);

    const results = await Promise.all(
      movers.map((m, i) =>
        http()
          .post(`/api/cards/${m.id}/move`)
          .set(i % 2 ? alice.auth : bob.auth)
          .send({ toListId: lists[0].id, beforeCardId: top.id, afterCardId: bottom.id }),
      ),
    );
    expect(results.every((r) => r.status === 200)).toBe(true);

    const final = await getSnapshot(app, alice, board.id);
    const ordered = cardsOfList(final, lists[0].id);
    const positions = ordered.map((c) => c.position);
    expect(new Set(positions).size).toBe(positions.length);
    expect(ordered[0]?.id).toBe(top.id);
    expect(ordered.at(-1)?.id).toBe(bottom.id);
    expect(ordered).toHaveLength(10);

    await watcher.rec.waitFor(() => (watcher.state().seq >= final.seq ? true : undefined));
    expect(comparable(watcher.state())).toEqual(comparable(final));
  });

  it('소켓(card:move)과 REST 이동이 섞여도 서버가 순서를 확정하고 클라이언트가 수렴한다', async () => {
    const cards = await Promise.all(
      Array.from({ length: 6 }, (_, i) => createCard(lists[0].id, `c${i}`)),
    );
    const aliceSocket = await connect(url, alice.accessToken);
    sockets.push(aliceSocket);
    await emitAck(aliceSocket, 'board:join', { boardId: board.id });
    const watcher = await observer(bob);

    await Promise.all(
      cards.map((c, i) =>
        i % 2
          ? emitAck(aliceSocket, 'card:move', {
              boardId: board.id,
              cardId: c.id,
              toListId: lists[2].id,
              beforeCardId: null,
              afterCardId: null,
            })
          : http()
              .post(`/api/cards/${c.id}/move`)
              .set(bob.auth)
              .send({ toListId: lists[2].id, beforeCardId: null, afterCardId: null }),
      ),
    );

    const final = await getSnapshot(app, alice, board.id);
    expect(cardsOfList(final, lists[2].id)).toHaveLength(6);
    await watcher.rec.waitFor(() => (watcher.state().seq >= final.seq ? true : undefined));
    expect(comparable(watcher.state())).toEqual(comparable(final));
  });

  it('같은 위치에 반복 삽입해 키가 길어지면 리스트를 rebalance하고 이벤트로 알린다', async () => {
    const anchor = await createCard(lists[0].id, 'anchor');
    const tail = await createCard(lists[0].id, 'tail');
    const watcher = await observer(alice);

    // anchor 바로 뒤에 계속 끼워 넣는다 → 간격이 점점 좁아짐
    let rebalanced = false;
    for (let i = 0; i < 300 && !rebalanced; i++) {
      const c = await createCard(lists[1].id, `n${i}`);
      await http()
        .post(`/api/cards/${c.id}/move`)
        .set(alice.auth)
        .send({ toListId: lists[0].id, beforeCardId: anchor.id, afterCardId: null })
        .expect(200);
      rebalanced = watcher.rec.events.some((e) => e.type === 'positions:rebalanced');
    }
    expect(rebalanced).toBe(true);

    const final = await getSnapshot(app, alice, board.id);
    const ordered = cardsOfList(final, lists[0].id);
    expect(ordered[0]?.id).toBe(anchor.id);
    expect(ordered.at(-1)?.id).toBe(tail.id);
    expect(Math.max(...ordered.map((c) => c.position.length))).toBeLessThanOrEqual(32);

    await watcher.rec.waitFor(() => (watcher.state().seq >= final.seq ? true : undefined), 10_000);
    expect(comparable(watcher.state())).toEqual(comparable(final));
  }, 120_000);

  it('같은 version을 기준으로 동시에 제목을 수정하면 하나만 성공하고 다른 하나는 409', async () => {
    const card = await createCard(lists[0].id, 'title');
    const [r1, r2] = await Promise.all([
      http()
        .patch(`/api/cards/${card.id}`)
        .set(alice.auth)
        .send({ title: 'alice', expectedVersion: 1 }),
      http()
        .patch(`/api/cards/${card.id}`)
        .set(bob.auth)
        .send({ title: 'bob', expectedVersion: 1 }),
    ]);
    expect([r1.status, r2.status].sort()).toEqual([200, 409]);
    const loser = r1.status === 409 ? r1 : r2;
    const winner = r1.status === 200 ? r1 : r2;
    expect(loser.body).toMatchObject({
      code: 'VERSION_CONFLICT',
      current: { title: (winner.body as CardDto).title, version: 2 },
    });
  });
});
