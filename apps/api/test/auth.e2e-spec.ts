import request from 'supertest';
import type { AuthResponse } from '@kanban/shared';
import { createTestApp, signup, type TestApp } from './helpers';

describe('Auth (e2e)', () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(() => app.close());

  const http = () => request(app.getHttpServer());

  it('회원가입 → access token + httpOnly refresh 쿠키', async () => {
    const res = await http()
      .post('/api/auth/signup')
      .send({ email: `NEW-${Date.now()}@Test.dev`, password: 'password123', name: 'New' })
      .expect(201);
    expect(res.body).toMatchObject({ accessToken: expect.any(String), user: { name: 'New' } });
    expect((res.body as AuthResponse).user.email).toMatch(/^new-/); // 소문자 정규화
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/kl_refresh=.+HttpOnly/);
    expect(cookie).toMatch(/Path=\/api\/auth/);
  });

  it('중복 이메일은 409', async () => {
    const u = await signup(app);
    const res = await http()
      .post('/api/auth/signup')
      .send({ email: u.user.email, password: 'password123', name: 'Dup' })
      .expect(409);
    expect(res.body).toMatchObject({ code: 'ALREADY_EXISTS', statusCode: 409 });
  });

  it('입력 검증 실패는 400 + details', async () => {
    const res = await http()
      .post('/api/auth/signup')
      .send({ email: 'nope', password: '1' })
      .expect(400);
    expect(res.body).toMatchObject({
      statusCode: 400,
      message: 'Validation failed',
      path: '/api/auth/signup',
    });
    expect((res.body as { details: string[] }).details.length).toBeGreaterThan(0);
  });

  it('로그인 성공 / 비밀번호 오류 401', async () => {
    const u = await signup(app);
    await http()
      .post('/api/auth/login')
      .send({ email: u.user.email, password: 'password123' })
      .expect(200);
    const res = await http()
      .post('/api/auth/login')
      .send({ email: u.user.email, password: 'wrong-pass' })
      .expect(401);
    expect(res.body).toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });

  it('토큰 없이 보호된 API 호출 시 401, 토큰이 있으면 /auth/me', async () => {
    const u = await signup(app);
    await http().get('/api/auth/me').expect(401);
    await http().get('/api/auth/me').set({ Authorization: 'Bearer garbage' }).expect(401);
    const res = await http().get('/api/auth/me').set(u.auth).expect(200);
    expect(res.body).toEqual(u.user);
  });

  it('refresh token 회전: 새 토큰 발급, 이전 토큰 재사용 시 401 + 전체 폐기', async () => {
    const u = await signup(app);
    const first = await http().post('/api/auth/refresh').set('Cookie', u.cookie).expect(200);
    const rotated = String((first.headers['set-cookie'] as unknown as string[])[0]).split(
      ';',
    )[0] as string;
    expect(rotated).not.toBe(u.cookie);

    // 이미 사용한 토큰 재사용 → 탈취로 간주
    await http().post('/api/auth/refresh').set('Cookie', u.cookie).expect(401);
    // 그 결과 회전된 최신 토큰까지 폐기된다
    await http().post('/api/auth/refresh').set('Cookie', rotated).expect(401);
  });

  it('로그아웃하면 refresh token을 더 쓸 수 없다', async () => {
    const u = await signup(app);
    await http().post('/api/auth/logout').set('Cookie', u.cookie).expect(204);
    await http().post('/api/auth/refresh').set('Cookie', u.cookie).expect(401);
  });
});
