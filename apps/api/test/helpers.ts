import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { AuthResponse, BoardSnapshotDto, BoardSummaryDto } from '@kanban/shared';
import { AppModule } from '../src/app.module';
import { loadEnvFile } from '../src/common/load-env';
import { setupApp } from '../src/common/setup-app';
import { APP_CONFIG, type AppConfig } from '../src/config';

loadEnvFile();

export type TestApp = INestApplication<App>;

export async function createTestApp(): Promise<TestApp> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>();
  setupApp(app, app.get<AppConfig>(APP_CONFIG));
  await app.init();
  return app;
}

export interface TestUser extends AuthResponse {
  auth: { Authorization: string };
  cookie: string;
}

export async function signup(app: TestApp, name = 'User'): Promise<TestUser> {
  const email = `${name.toLowerCase()}-${randomUUID()}@test.dev`;
  const res = await request(app.getHttpServer())
    .post('/api/auth/signup')
    .send({ email, password: 'password123', name })
    .expect(201);
  const body = res.body as AuthResponse;
  const setCookie = res.headers['set-cookie'] as unknown as string[];
  return {
    ...body,
    auth: { Authorization: `Bearer ${body.accessToken}` },
    cookie: (setCookie[0] ?? '').split(';')[0] as string,
  };
}

export async function createBoard(
  app: TestApp,
  user: TestUser,
  title = 'Board',
): Promise<BoardSummaryDto> {
  const res = await request(app.getHttpServer())
    .post('/api/boards')
    .set(user.auth)
    .send({ title })
    .expect(201);
  return res.body as BoardSummaryDto;
}

export async function getSnapshot(
  app: TestApp,
  user: TestUser,
  boardId: string,
): Promise<BoardSnapshotDto> {
  const res = await request(app.getHttpServer())
    .get(`/api/boards/${boardId}`)
    .set(user.auth)
    .expect(200);
  return res.body as BoardSnapshotDto;
}
