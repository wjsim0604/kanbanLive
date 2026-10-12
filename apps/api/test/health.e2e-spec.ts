import request from 'supertest';
import { createTestApp, type TestApp } from './helpers';

describe('GET /api/health (실제 DB/Redis)', () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(() => app.close());

  it('DB와 Redis에 연결되어 ok를 반환한다', async () => {
    const res = await request(app.getHttpServer()).get('/api/health').expect(200);
    expect(res.body).toMatchObject({ status: 'ok', db: 'up', redis: 'up' });
  });

  it('Swagger 문서를 /docs-json 으로 제공한다', async () => {
    const res = await request(app.getHttpServer()).get('/docs-json').expect(200);
    expect(res.body).toHaveProperty('paths./api/cards/{id}/move');
  });
});
