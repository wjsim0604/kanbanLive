import request from 'supertest';
import type { BoardSummaryDto, ListDto } from '@kanban/shared';
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
 * 두 개의 api 인스턴스(같은 PostgreSQL/Redis)를 띄우고,
 * 서로 다른 인스턴스에 붙은 클라이언트끼리 이벤트와 접속자 정보가 공유되는지 검증한다 (Redis adapter).
 */
describe('Multi-instance (Redis adapter, e2e)', () => {
  let server1: TestApp;
  let server2: TestApp;
  let url1: string;
  let url2: string;
  let alice: TestUser;
  let bob: TestUser;
  let board: BoardSummaryDto;
  let lists: ListDto[];
  const sockets: ClientSocket[] = [];

  beforeAll(async () => {
    [server1, server2] = await Promise.all([createTestApp(), createTestApp()]);
    [url1, url2] = await Promise.all([listen(server1), listen(server2)]);
    [alice, bob] = await Promise.all([signup(server1, 'Alice'), signup(server2, 'Bob')]);
    board = await createBoard(server1, alice, 'Scale-out');
    await request(server1.getHttpServer())
      .post(`/api/boards/${board.id}/members`)
      .set(alice.auth)
      .send({ email: bob.user.email })
      .expect(201);
    lists = (await getSnapshot(server2, bob, board.id)).lists;
  });

  afterAll(async () => {
    for (const s of sockets) s.close();
    await Promise.all([server1.close(), server2.close()]);
  });

  it('서버 1에서 일어난 변경이 서버 2에 붙은 클라이언트에 전달된다', async () => {
    const bobSocket = await connect(url2, bob.accessToken);
    sockets.push(bobSocket);
    const rec = new Recorder(bobSocket);
    await emitAck(bobSocket, 'board:join', { boardId: board.id });

    await request(server1.getHttpServer())
      .post(`/api/lists/${lists[0]?.id}/cards`)
      .set(alice.auth)
      .send({ title: 'from server 1' })
      .expect(201);
    const e = await rec.event('card:created', (ev) => ev.payload.card.title === 'from server 1');
    expect(e.actorId).toBe(alice.user.id);
  });

  it('소켓 쓰기(card:create)도 다른 서버의 클라이언트에 전달된다', async () => {
    const aliceSocket = await connect(url1, alice.accessToken);
    const bobSocket = await connect(url2, bob.accessToken);
    sockets.push(aliceSocket, bobSocket);
    const rec = new Recorder(aliceSocket);
    await emitAck(aliceSocket, 'board:join', { boardId: board.id });
    await emitAck(bobSocket, 'board:join', { boardId: board.id });

    const ack = await emitAck(bobSocket, 'card:create', {
      boardId: board.id,
      listId: lists[1]?.id,
      title: 'from server 2',
    });
    expect(ack.ok).toBe(true);
    await rec.event('card:created', (ev) => ev.payload.card.title === 'from server 2');
  });

  it('presence는 두 서버에 흩어진 접속자를 모두 포함한다', async () => {
    const aliceSocket = await connect(url1, alice.accessToken);
    sockets.push(aliceSocket);
    const rec = new Recorder(aliceSocket);
    await emitAck(aliceSocket, 'board:join', { boardId: board.id });
    const bobSocket = await connect(url2, bob.accessToken);
    sockets.push(bobSocket);
    await emitAck(bobSocket, 'board:join', { boardId: board.id });

    const p = await rec.waitFor(() =>
      rec.presence.find(
        (x) =>
          x.users.some((u) => u.id === alice.user.id) && x.users.some((u) => u.id === bob.user.id),
      ),
    );
    expect(p.boardId).toBe(board.id);
  });

  it('seq는 Redis INCR로 발급되어 두 서버에서 번갈아 써도 단조 증가한다', async () => {
    const watcher = await connect(url1, alice.accessToken);
    sockets.push(watcher);
    const rec = new Recorder(watcher);
    await emitAck(watcher, 'board:join', { boardId: board.id });

    for (let i = 0; i < 6; i++) {
      const server = i % 2 ? server2 : server1;
      const user = i % 2 ? bob : alice;
      await request(server.getHttpServer())
        .post(`/api/boards/${board.id}/lists`)
        .set(user.auth)
        .send({ title: `L${i}` })
        .expect(201);
    }
    await rec.waitFor(() =>
      rec.events.filter((e) => e.type === 'list:created').length >= 6 ? true : undefined,
    );
    const seqs = rec.events.filter((e) => e.type === 'list:created').map((e) => e.seq);
    expect([...seqs].sort((a, b) => a - b)).toEqual(seqs);
    expect(new Set(seqs).size).toBe(seqs.length);
  });
});
