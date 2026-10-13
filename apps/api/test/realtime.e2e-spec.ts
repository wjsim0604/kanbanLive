import type Redis from 'ioredis';
import request from 'supertest';
import type { BoardSummaryDto, CardDto, ListDto, SyncResponse } from '@kanban/shared';
import { logKey } from '../src/events/board-events.service';
import { REDIS } from '../src/redis/redis.module';
import {
  createBoard,
  createTestApp,
  getSnapshot,
  signup,
  type TestApp,
  type TestUser,
} from './helpers';
import { connect, emitAck, listen, Recorder, type ClientSocket } from './socket-helpers';

describe('Realtime gateway (e2e)', () => {
  let app: TestApp;
  let url: string;
  let owner: TestUser;
  let viewer: TestUser;
  let stranger: TestUser;
  let board: BoardSummaryDto;
  let lists: ListDto[];
  const sockets: ClientSocket[] = [];

  const http = () => request(app.getHttpServer());
  const open = async (user: TestUser) => {
    const s = await connect(url, user.accessToken);
    sockets.push(s);
    return s;
  };

  beforeAll(async () => {
    app = await createTestApp();
    url = await listen(app);
    [owner, viewer, stranger] = await Promise.all([
      signup(app, 'Owner'),
      signup(app, 'Viewer'),
      signup(app, 'Stranger'),
    ]);
    board = await createBoard(app, owner, 'Realtime');
    await http()
      .post(`/api/boards/${board.id}/members`)
      .set(owner.auth)
      .send({ email: viewer.user.email, role: 'VIEWER' })
      .expect(201);
    lists = (await getSnapshot(app, owner, board.id)).lists;
  });

  afterEach(() => {
    while (sockets.length) sockets.pop()?.close();
  });
  afterAll(() => app.close());

  it('토큰이 없거나 잘못되면 연결이 거부된다 (UNAUTHORIZED)', async () => {
    await expect(connect(url, undefined)).rejects.toThrow('UNAUTHORIZED');
    await expect(connect(url, 'bad-token')).rejects.toThrow('UNAUTHORIZED');
  });

  it('멤버가 아니면 board:join 이 403으로 거부된다', async () => {
    const s = await open(stranger);
    const ack = await emitAck(s, 'board:join', { boardId: board.id });
    expect(ack).toMatchObject({ ok: false, error: { status: 403, code: 'NOT_A_MEMBER' } });
  });

  it('REST 변경이 같은 보드 룸에 seq와 함께 브로드캐스트된다', async () => {
    const s = await open(viewer);
    const rec = new Recorder(s);
    const join = await emitAck<{ role: string; seq: number }>(s, 'board:join', {
      boardId: board.id,
    });
    expect(join).toMatchObject({ ok: true, data: { role: 'VIEWER' } });
    const seqBefore = join.ok ? join.data.seq : 0;

    const res = await http()
      .post(`/api/lists/${lists[0]?.id}/cards`)
      .set(owner.auth)
      .send({ title: '실시간 카드' })
      .expect(201);
    const created = await rec.event(
      'card:created',
      (e) => e.payload.card.id === (res.body as CardDto).id,
    );
    expect(created).toMatchObject({
      boardId: board.id,
      actorId: owner.user.id,
      seq: seqBefore + 1,
    });

    await http()
      .post(`/api/cards/${created.payload.card.id}/move`)
      .set(owner.auth)
      .send({ toListId: lists[1]?.id })
      .expect(200);
    const moved = await rec.event('card:moved');
    expect(moved.seq).toBe(seqBefore + 2);
    expect(moved.payload).toMatchObject({
      fromListId: lists[0]?.id,
      card: { listId: lists[1]?.id, version: 2 },
    });
  });

  it('소켓으로 card:move 를 보내면 서비스 계층을 거쳐 확정되고 ack + 브로드캐스트된다', async () => {
    const card = (
      await http()
        .post(`/api/lists/${lists[0]?.id}/cards`)
        .set(owner.auth)
        .send({ title: 'socket move' })
        .expect(201)
    ).body as CardDto;
    const ownerSocket = await open(owner);
    const viewerSocket = await open(viewer);
    const rec = new Recorder(viewerSocket);
    await emitAck(ownerSocket, 'board:join', { boardId: board.id });
    await emitAck(viewerSocket, 'board:join', { boardId: board.id });

    const ack = await emitAck<CardDto>(ownerSocket, 'card:move', {
      boardId: board.id,
      cardId: card.id,
      toListId: lists[2]?.id,
      beforeCardId: null,
      afterCardId: null,
    });
    expect(ack).toMatchObject({
      ok: true,
      data: { id: card.id, listId: lists[2]?.id, version: 2 },
    });
    await rec.event('card:moved', (e) => e.payload.card.id === card.id);
  });

  it('VIEWER의 소켓 쓰기는 403, 잘못된 페이로드는 400', async () => {
    const s = await open(viewer);
    await emitAck(s, 'board:join', { boardId: board.id });
    const denied = await emitAck(s, 'list:create', { boardId: board.id, title: 'nope' });
    expect(denied).toMatchObject({ ok: false, error: { status: 403, code: 'INSUFFICIENT_ROLE' } });
    const invalid = await emitAck(s, 'card:move', { boardId: board.id, cardId: 'not-uuid' });
    expect(invalid).toMatchObject({ ok: false, error: { status: 400 } });
  });

  it('sync: lastSeq 이후 누락 이벤트를 순서대로 돌려준다', async () => {
    const s = await open(owner);
    const join = await emitAck<{ seq: number }>(s, 'board:join', { boardId: board.id });
    const lastSeq = join.ok ? join.data.seq : 0;
    await http()
      .post(`/api/boards/${board.id}/lists`)
      .set(owner.auth)
      .send({ title: 'L1' })
      .expect(201);
    await http()
      .post(`/api/boards/${board.id}/lists`)
      .set(owner.auth)
      .send({ title: 'L2' })
      .expect(201);

    const res = await emitAck<SyncResponse>(s, 'sync', { boardId: board.id, lastSeq });
    expect(res.ok).toBe(true);
    if (!res.ok || res.data.kind !== 'events') throw new Error('expected events');
    expect(res.data.events.map((e) => e.seq)).toEqual([lastSeq + 1, lastSeq + 2]);
    expect(res.data.seq).toBe(lastSeq + 2);
  });

  it('sync: Redis 이벤트 로그 범위를 벗어나면(오래 끊김) 전체 스냅샷을 돌려준다', async () => {
    const s = await open(owner);
    const join = await emitAck<{ seq: number }>(s, 'board:join', { boardId: board.id });
    const lastSeq = join.ok ? join.data.seq : 0;
    for (const title of ['old1', 'old2', 'old3']) {
      await http()
        .post(`/api/boards/${board.id}/lists`)
        .set(owner.auth)
        .send({ title })
        .expect(201);
    }
    // 로그가 잘려 나간 상황을 재현: 가장 오래된 이벤트들을 지운다
    const redis = app.get<Redis>(REDIS);
    await redis.zremrangebyrank(logKey(board.id), 0, -2);

    const res = await emitAck<SyncResponse>(s, 'sync', { boardId: board.id, lastSeq });
    expect(res).toMatchObject({ ok: true, data: { kind: 'snapshot' } });
    if (res.ok && res.data.kind === 'snapshot') {
      expect(res.data.snapshot.lists.map((l) => l.title)).toEqual(
        expect.arrayContaining(['old1', 'old2', 'old3']),
      );
      expect(res.data.snapshot.seq).toBeGreaterThanOrEqual(lastSeq + 3);
    }
  });

  it('sync: 서버보다 앞선(초기화된) lastSeq면 스냅샷을 돌려준다', async () => {
    const s = await open(owner);
    await emitAck(s, 'board:join', { boardId: board.id });
    const res = await emitAck<SyncResponse>(s, 'sync', { boardId: board.id, lastSeq: 999_999 });
    expect(res).toMatchObject({
      ok: true,
      data: { kind: 'snapshot', snapshot: { board: { id: board.id } } },
    });
  });

  it('presence: 같은 보드 접속자 목록이 갱신된다', async () => {
    const a = await open(owner);
    const recA = new Recorder(a);
    await emitAck(a, 'board:join', { boardId: board.id });
    const b = await open(viewer);
    await emitAck(b, 'board:join', { boardId: board.id });

    await recA.waitFor(() => recA.presence.find((p) => p.users.length === 2));
    b.close();
    await recA.waitFor(() => (recA.presence.at(-1)?.users.length === 1 ? true : undefined));
    expect(recA.presence.at(-1)?.users[0]).toMatchObject({ id: owner.user.id, connections: 1 });
  });

  it('멤버에서 제거되면 이벤트를 받은 뒤 룸에서 빠져 더 이상 이벤트를 받지 않는다', async () => {
    const temp = await signup(app, 'Temp');
    await http()
      .post(`/api/boards/${board.id}/members`)
      .set(owner.auth)
      .send({ email: temp.user.email })
      .expect(201);
    const s = await open(temp);
    const rec = new Recorder(s);
    await emitAck(s, 'board:join', { boardId: board.id });

    await http()
      .delete(`/api/boards/${board.id}/members/${temp.user.id}`)
      .set(owner.auth)
      .expect(204);
    await rec.event('member:removed', (e) => e.payload.userId === temp.user.id);
    const count = rec.events.length;
    await http()
      .post(`/api/boards/${board.id}/lists`)
      .set(owner.auth)
      .send({ title: 'after removal' })
      .expect(201);
    await new Promise((r) => setTimeout(r, 300));
    expect(rec.events.length).toBe(count);
  });
});
