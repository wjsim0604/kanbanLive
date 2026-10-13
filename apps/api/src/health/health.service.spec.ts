import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS } from '../redis/redis.module';
import { HealthService } from './health.service';

describe('HealthService', () => {
  const queryRaw = jest.fn();
  const ping = jest.fn();
  let service: HealthService;

  beforeEach(async () => {
    queryRaw.mockReset().mockResolvedValue([{ '?column?': 1 }]);
    ping.mockReset().mockResolvedValue('PONG');
    const moduleRef = await Test.createTestingModule({
      providers: [
        HealthService,
        { provide: PrismaService, useValue: { $queryRaw: queryRaw } },
        { provide: REDIS, useValue: { ping } },
      ],
    }).compile();
    service = moduleRef.get(HealthService);
  });

  it('DB와 Redis가 모두 응답하면 ok', async () => {
    await expect(service.check()).resolves.toMatchObject({ status: 'ok', db: 'up', redis: 'up' });
  });

  it('DB 쿼리가 실패하면 error / db down', async () => {
    queryRaw.mockRejectedValue(new Error('connection refused'));
    await expect(service.check()).resolves.toMatchObject({
      status: 'error',
      db: 'down',
      redis: 'up',
    });
  });

  it('Redis가 응답하지 않으면 error / redis down', async () => {
    ping.mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(service.check()).resolves.toMatchObject({
      status: 'error',
      db: 'up',
      redis: 'down',
    });
  });
});
