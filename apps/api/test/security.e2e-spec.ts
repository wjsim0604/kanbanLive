import { createHmac } from 'node:crypto';
import request from 'supertest';
import { createTestApp, signup, type TestApp } from './helpers';
import { connect, listen } from './socket-helpers';

/** 테스트 동안만 환경 변수를 바꾸고 원래대로 돌려놓는다 (config는 앱 생성 시 읽힌다). */
async function withEnv<T>(vars: Record<string, string>, fn: () => Promise<T>): Promise<T> {
  const saved = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  Object.assign(process.env, vars);
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

const b64url = (v: object) => Buffer.from(JSON.stringify(v)).toString('base64url');

describe('Security hardening (e2e)', () => {
  describe('기본 설정', () => {
    let app: TestApp;
    beforeAll(async () => {
      app = await createTestApp();
    });
    afterAll(() => app.close());
    const http = () => request(app.getHttpServer());

    it('보안 헤더를 보내고 X-Powered-By는 숨긴다', async () => {
      const res = await http().get('/api/health').expect(200);
      expect(res.headers['x-powered-by']).toBeUndefined();
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      const csp = String(res.headers['content-security-policy']);
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("script-src 'self'");
      expect(csp).toContain("frame-ancestors 'none'");
    });

    it('없는 계정 로그인도 가입된 계정과 비슷한 시간이 걸린다 (타이밍으로 가입 여부를 알 수 없음)', async () => {
      const u = await signup(app, 'Timing');
      const time = async (email: string) => {
        const started = performance.now();
        await http()
          .post('/api/auth/login')
          .send({ email, password: 'wrong-password' })
          .expect(401);
        return performance.now() - started;
      };
      await time(u.user.email); // 워밍업 (더미 해시 생성 포함)
      await time('warmup@nowhere.dev');
      const existing: number[] = [];
      const unknown: number[] = [];
      for (let i = 0; i < 4; i++) {
        existing.push(await time(u.user.email));
        unknown.push(await time(`nobody-${i}@nowhere.dev`));
      }
      const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
      // 수정 전에는 약 100ms vs 5ms (20배 차이)였다
      expect(avg(unknown)).toBeGreaterThan(avg(existing) * 0.5);
    });

    it('HS256이 아닌 알고리즘으로 서명한 토큰은 거부한다 (alg 혼동 방지)', async () => {
      const u = await signup(app, 'Alg');
      const payload = {
        sub: u.user.id,
        email: u.user.email,
        name: u.user.name,
        exp: Math.floor(Date.now() / 1000) + 600,
      };
      const none = `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url(payload)}.`;
      await http().get('/api/auth/me').set('Authorization', `Bearer ${none}`).expect(401);

      // 같은 비밀키라도 HS512는 허용하지 않는다
      const secret = process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret';
      const unsigned = `${b64url({ alg: 'HS512', typ: 'JWT' })}.${b64url(payload)}`;
      const sig = createHmac('sha512', secret).update(unsigned).digest('base64url');
      await http()
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${unsigned}.${sig}`)
        .expect(401);

      await http().get('/api/auth/me').set(u.auth).expect(200);
    });

    it('형식이 맞는 X-Request-Id만 이어 쓰고, 이상한 값은 새로 발급한다', async () => {
      const ok = await http().get('/api/health').set('X-Request-Id', 'trace-123').expect(200);
      expect(ok.headers['x-request-id']).toBe('trace-123');
      const bad = await http().get('/api/health').set('X-Request-Id', 'x'.repeat(200)).expect(200);
      expect(bad.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  it('같은 계정으로 로그인을 반복 실패하면 429, 다른 계정은 영향 없음', async () => {
    await withEnv({ AUTH_RATE_LIMIT_PER_ACCOUNT: '3', AUTH_RATE_LIMIT_PER_IP: '100' }, async () => {
      const app = await createTestApp();
      try {
        const http = () => request(app.getHttpServer());
        const u = await signup(app, 'Brute');
        const attempt = (email: string) =>
          http().post('/api/auth/login').send({ email, password: 'guess-guess' });
        for (let i = 0; i < 3; i++) await attempt(u.user.email).expect(401);
        const limited = await attempt(u.user.email).expect(429);
        expect(limited.headers['retry-after']).toBeDefined();
        expect(limited.body).toMatchObject({ statusCode: 429 });
        // 대소문자를 바꿔도 같은 계정으로 센다
        await attempt(u.user.email.toUpperCase()).expect(429);
        // 다른 계정은 계속 시도할 수 있다
        await attempt('someone-else@nowhere.dev').expect(401);
      } finally {
        await app.close();
      }
    });
  });

  it('같은 IP에서 이메일을 바꿔 가며 시도해도 IP 한도에 걸린다', async () => {
    await withEnv({ AUTH_RATE_LIMIT_PER_ACCOUNT: '100', AUTH_RATE_LIMIT_PER_IP: '5' }, async () => {
      const app = await createTestApp();
      try {
        const http = () => request(app.getHttpServer());
        const statuses: number[] = [];
        for (let i = 0; i < 7; i++) {
          const res = await http()
            .post('/api/auth/login')
            .send({ email: `spray-${i}@nowhere.dev`, password: 'x' });
          statuses.push(res.status);
        }
        expect(statuses.slice(0, 5).every((s) => s === 401)).toBe(true);
        expect(statuses.slice(5)).toEqual([429, 429]);
      } finally {
        await app.close();
      }
    });
  });

  it('SWAGGER_ENABLED=false면 /docs를 노출하지 않는다', async () => {
    await withEnv({ SWAGGER_ENABLED: 'false' }, async () => {
      const app = await createTestApp();
      try {
        await request(app.getHttpServer()).get('/docs-json').expect(404);
      } finally {
        await app.close();
      }
    });
  });

  it('access token이 만료되면 서버가 소켓 연결을 끊는다 (재접속 시 토큰 재검증)', async () => {
    await withEnv({ ACCESS_TOKEN_TTL_SEC: '2' }, async () => {
      const app = await createTestApp();
      try {
        const url = await listen(app);
        const u = await signup(app, 'Expiry');
        const socket = await connect(url, u.accessToken);
        const reason = await new Promise<string>((resolve) => socket.once('disconnect', resolve));
        expect(reason).toBe('io server disconnect');
        // 만료된 토큰으로는 다시 붙을 수 없다
        await expect(connect(url, u.accessToken)).rejects.toThrow('UNAUTHORIZED');
      } finally {
        await app.close();
      }
    });
  }, 15_000);
});
