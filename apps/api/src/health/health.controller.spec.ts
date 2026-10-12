import { HttpStatus, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { HealthResponse } from '@kanban/shared';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

describe('HealthController (HTTP)', () => {
  let app: INestApplication<App>;
  const check = jest.fn<Promise<HealthResponse>, []>();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: HealthService, useValue: { check } }],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const result = (overrides: Partial<HealthResponse>): HealthResponse => ({
    status: 'ok',
    db: 'up',
    redis: 'up',
    instance: 'test',
    uptime: 1,
    timestamp: new Date(0).toISOString(),
    ...overrides,
  });

  it('정상이면 200', async () => {
    check.mockResolvedValue(result({}));

    await request(app.getHttpServer()).get('/health').expect(HttpStatus.OK);
  });

  it('DB가 down이면 503', async () => {
    check.mockResolvedValue(result({ status: 'error', db: 'down' }));

    const res = await request(app.getHttpServer())
      .get('/health')
      .expect(HttpStatus.SERVICE_UNAVAILABLE);
    expect(res.body).toMatchObject({ db: 'down' });
  });
});
