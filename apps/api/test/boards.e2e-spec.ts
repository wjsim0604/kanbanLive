import request from 'supertest';
import type { BoardSummaryDto, CardDetailDto, CardDto, ListDto } from '@kanban/shared';
import {
  createBoard,
  createTestApp,
  getSnapshot,
  signup,
  type TestApp,
  type TestUser,
} from './helpers';

describe('Boards / Lists / Cards (e2e)', () => {
  let app: TestApp;
  let owner: TestUser;
  let editor: TestUser;
  let viewer: TestUser;
  let stranger: TestUser;
  let board: BoardSummaryDto;

  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
    [owner, editor, viewer, stranger] = await Promise.all([
      signup(app, 'Owner'),
      signup(app, 'Editor'),
      signup(app, 'Viewer'),
      signup(app, 'Stranger'),
    ]);
    board = await createBoard(app, owner, '포트폴리오');
    await http()
      .post(`/api/boards/${board.id}/members`)
      .set(owner.auth)
      .send({ email: editor.user.email, role: 'EDITOR' })
      .expect(201);
    await http()
      .post(`/api/boards/${board.id}/members`)
      .set(owner.auth)
      .send({ email: viewer.user.email, role: 'VIEWER' })
      .expect(201);
  });
  afterAll(() => app.close());

  describe('보드', () => {
    it('생성 시 OWNER 멤버십과 기본 리스트 3개가 만들어진다', async () => {
      const snap = await getSnapshot(app, owner, board.id);
      expect(snap.role).toBe('OWNER');
      expect(snap.lists.map((l) => l.title)).toEqual(['할 일', '진행 중', '완료']);
      expect(snap.members).toHaveLength(3);
    });

    it('내가 속한 보드 목록에 역할과 함께 나타난다', async () => {
      const res = await http().get('/api/boards').set(viewer.auth).expect(200);
      expect(res.body).toContainEqual(expect.objectContaining({ id: board.id, role: 'VIEWER' }));
      const strangers = await http().get('/api/boards').set(stranger.auth).expect(200);
      expect(strangers.body).not.toContainEqual(expect.objectContaining({ id: board.id }));
    });

    it('멤버가 아니면 보드 접근 시 403', async () => {
      const res = await http().get(`/api/boards/${board.id}`).set(stranger.auth).expect(403);
      expect(res.body).toMatchObject({ code: 'NOT_A_MEMBER' });
    });

    it('존재하지 않는 보드는 404, 잘못된 id 형식은 400', async () => {
      await http()
        .get('/api/boards/00000000-0000-4000-8000-000000000000')
        .set(owner.auth)
        .expect(404);
      await http().get('/api/boards/not-a-uuid').set(owner.auth).expect(400);
    });

    it('이름 변경/멤버 초대는 OWNER만 가능', async () => {
      await http()
        .patch(`/api/boards/${board.id}`)
        .set(editor.auth)
        .send({ title: 'x' })
        .expect(403);
      await http()
        .post(`/api/boards/${board.id}/members`)
        .set(editor.auth)
        .send({ email: stranger.user.email })
        .expect(403);
      const res = await http()
        .patch(`/api/boards/${board.id}`)
        .set(owner.auth)
        .send({ title: '새 이름' })
        .expect(200);
      expect(res.body).toMatchObject({ title: '새 이름' });
    });

    it('이미 멤버인 사용자 초대는 409, 없는 이메일은 404', async () => {
      await http()
        .post(`/api/boards/${board.id}/members`)
        .set(owner.auth)
        .send({ email: editor.user.email })
        .expect(409);
      await http()
        .post(`/api/boards/${board.id}/members`)
        .set(owner.auth)
        .send({ email: 'nobody@test.dev' })
        .expect(404);
    });

    it('OWNER의 역할은 바꿀 수 없다', async () => {
      await http()
        .patch(`/api/boards/${board.id}/members/${owner.user.id}`)
        .set(owner.auth)
        .send({ role: 'VIEWER' })
        .expect(403);
    });

    it('보드 삭제는 OWNER만, 삭제 후 404', async () => {
      const temp = await createBoard(app, owner, 'temp');
      await http()
        .post(`/api/boards/${temp.id}/members`)
        .set(owner.auth)
        .send({ email: editor.user.email })
        .expect(201);
      await http().delete(`/api/boards/${temp.id}`).set(editor.auth).expect(403);
      await http().delete(`/api/boards/${temp.id}`).set(owner.auth).expect(204);
      await http().get(`/api/boards/${temp.id}`).set(owner.auth).expect(404);
    });
  });

  describe('리스트', () => {
    it('생성(맨 뒤)·이름 변경·이동·삭제', async () => {
      const created = await http()
        .post(`/api/boards/${board.id}/lists`)
        .set(editor.auth)
        .send({ title: '보류' })
        .expect(201);
      const list = created.body as ListDto;
      let snap = await getSnapshot(app, owner, board.id);
      expect(snap.lists.at(-1)?.id).toBe(list.id);

      await http()
        .patch(`/api/lists/${list.id}`)
        .set(editor.auth)
        .send({ title: '보류됨' })
        .expect(200);

      const first = snap.lists[0] as ListDto;
      await http()
        .post(`/api/lists/${list.id}/move`)
        .set(editor.auth)
        .send({ beforeListId: null, afterListId: first.id })
        .expect(200);
      snap = await getSnapshot(app, owner, board.id);
      expect(snap.lists[0]).toMatchObject({ id: list.id, title: '보류됨', version: 3 });

      await http().delete(`/api/lists/${list.id}`).set(editor.auth).expect(204);
      snap = await getSnapshot(app, owner, board.id);
      expect(snap.lists.map((l) => l.id)).not.toContain(list.id);
    });

    it('VIEWER는 리스트를 만들 수 없다 (403)', async () => {
      const res = await http()
        .post(`/api/boards/${board.id}/lists`)
        .set(viewer.auth)
        .send({ title: 'x' })
        .expect(403);
      expect(res.body).toMatchObject({ code: 'INSUFFICIENT_ROLE' });
    });
  });

  describe('카드', () => {
    let todo: ListDto;
    let doing: ListDto;
    const createCard = async (listId: string, title: string) =>
      (await http().post(`/api/lists/${listId}/cards`).set(editor.auth).send({ title }).expect(201))
        .body as CardDto;

    beforeAll(async () => {
      const snap = await getSnapshot(app, owner, board.id);
      [todo, doing] = snap.lists as [ListDto, ListDto];
    });

    it('생성 시 리스트 맨 뒤에 추가된다', async () => {
      const a = await createCard(todo.id, 'A');
      const b = await createCard(todo.id, 'B');
      expect(b.position > a.position).toBe(true);
      expect(a).toMatchObject({ boardId: board.id, listId: todo.id, version: 1, commentCount: 0 });
    });

    it('리스트 내 이동 / 리스트 간 이동 후 조회 시 순서가 유지된다', async () => {
      const c1 = await createCard(doing.id, 'C1');
      const c2 = await createCard(doing.id, 'C2');
      const c3 = await createCard(doing.id, 'C3');

      // C3를 맨 위로
      await http()
        .post(`/api/cards/${c3.id}/move`)
        .set(editor.auth)
        .send({ toListId: doing.id, beforeCardId: null, afterCardId: c1.id })
        .expect(200);
      let snap = await getSnapshot(app, owner, board.id);
      const order = (listId: string) =>
        snap.cards.filter((c) => c.listId === listId).map((c) => c.title);
      expect(order(doing.id)).toEqual(['C3', 'C1', 'C2']);

      // C1을 todo 리스트 맨 아래로
      const moved = await http()
        .post(`/api/cards/${c1.id}/move`)
        .set(editor.auth)
        .send({ toListId: todo.id })
        .expect(200);
      expect(moved.body).toMatchObject({ listId: todo.id, version: 2 });
      snap = await getSnapshot(app, owner, board.id);
      expect(order(doing.id)).toEqual(['C3', 'C2']);
      expect(order(todo.id).at(-1)).toBe('C1');
      void c2;
    });

    it('다른 보드의 리스트로는 옮길 수 없다 (400)', async () => {
      const card = await createCard(todo.id, 'X');
      const other = await createBoard(app, editor, 'other');
      const otherSnap = await getSnapshot(app, editor, other.id);
      await http()
        .post(`/api/cards/${card.id}/move`)
        .set(editor.auth)
        .send({ toListId: otherSnap.lists[0]?.id })
        .expect(400);
    });

    it('상세 수정: 담당자/마감일 설정 및 해제, 멤버가 아닌 담당자는 400', async () => {
      const card = await createCard(todo.id, 'Detail');
      const res = await http()
        .patch(`/api/cards/${card.id}`)
        .set(editor.auth)
        .send({ description: '설명', assigneeId: viewer.user.id, dueDate: '2026-12-31' })
        .expect(200);
      expect(res.body).toMatchObject({
        description: '설명',
        assigneeId: viewer.user.id,
        version: 2,
      });
      expect((res.body as CardDto).dueDate).toMatch(/^2026-12-31/);

      const cleared = await http()
        .patch(`/api/cards/${card.id}`)
        .set(editor.auth)
        .send({ assigneeId: null, dueDate: null })
        .expect(200);
      expect(cleared.body).toMatchObject({ assigneeId: null, dueDate: null, description: '설명' });

      await http()
        .patch(`/api/cards/${card.id}`)
        .set(editor.auth)
        .send({ assigneeId: stranger.user.id })
        .expect(400);
    });

    it('expectedVersion이 다르면 409 VERSION_CONFLICT + 최신 카드', async () => {
      const card = await createCard(todo.id, 'Conflict');
      await http()
        .patch(`/api/cards/${card.id}`)
        .set(editor.auth)
        .send({ title: 'first', expectedVersion: 1 })
        .expect(200);
      const res = await http()
        .patch(`/api/cards/${card.id}`)
        .set(owner.auth)
        .send({ title: 'second', expectedVersion: 1 })
        .expect(409);
      expect(res.body).toMatchObject({
        code: 'VERSION_CONFLICT',
        current: { title: 'first', version: 2 },
      });
    });

    it('댓글 작성 후 카드 상세에 포함된다, VIEWER는 조회만 가능', async () => {
      const card = await createCard(todo.id, 'Comments');
      await http()
        .post(`/api/cards/${card.id}/comments`)
        .set(editor.auth)
        .send({ content: '첫 댓글' })
        .expect(201);
      await http()
        .post(`/api/cards/${card.id}/comments`)
        .set(viewer.auth)
        .send({ content: 'x' })
        .expect(403);
      const res = await http().get(`/api/cards/${card.id}`).set(viewer.auth).expect(200);
      const detail = res.body as CardDetailDto;
      expect(detail.commentCount).toBe(1);
      expect(detail.comments[0]).toMatchObject({
        content: '첫 댓글',
        author: { id: editor.user.id },
      });
    });

    it('VIEWER와 외부인은 카드를 수정/이동/삭제할 수 없다', async () => {
      const card = await createCard(todo.id, 'Protected');
      await http().patch(`/api/cards/${card.id}`).set(viewer.auth).send({ title: 'x' }).expect(403);
      await http()
        .post(`/api/cards/${card.id}/move`)
        .set(viewer.auth)
        .send({ toListId: todo.id })
        .expect(403);
      await http().delete(`/api/cards/${card.id}`).set(viewer.auth).expect(403);
      await http().get(`/api/cards/${card.id}`).set(stranger.auth).expect(403);
      await http().delete(`/api/cards/${card.id}`).set(editor.auth).expect(204);
      await http().get(`/api/cards/${card.id}`).set(editor.auth).expect(404);
    });

    it('멤버를 내보내면 그 멤버가 담당하던 카드의 담당자가 비워진다', async () => {
      const temp = await signup(app, 'Temp');
      await http()
        .post(`/api/boards/${board.id}/members`)
        .set(owner.auth)
        .send({ email: temp.user.email })
        .expect(201);
      const card = await createCard(todo.id, 'Assigned');
      await http()
        .patch(`/api/cards/${card.id}`)
        .set(editor.auth)
        .send({ assigneeId: temp.user.id })
        .expect(200);
      await http()
        .delete(`/api/boards/${board.id}/members/${temp.user.id}`)
        .set(owner.auth)
        .expect(204);
      const res = await http().get(`/api/cards/${card.id}`).set(editor.auth).expect(200);
      expect(res.body).toMatchObject({ assigneeId: null });
    });
  });
});
