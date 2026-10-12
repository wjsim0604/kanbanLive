import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { HealthService } from './health.service';

describe('HealthService', () => {
  const queryRaw = jest.fn();
  let service: HealthService;

  beforeEach(async () => {
    queryRaw.mockReset();
    const moduleRef = await Test.createTestingModule({
      providers: [HealthService, { provide: PrismaService, useValue: { $queryRaw: queryRaw } }],
    }).compile();
    service = moduleRef.get(HealthService);
  });

  it('DB 쿼리가 성공하면 ok / up', async () => {
    queryRaw.mockResolvedValue([{ '?column?': 1 }]);

    await expect(service.check()).resolves.toMatchObject({ status: 'ok', db: 'up' });
  });

  it('DB 쿼리가 실패하면 error / down', async () => {
    queryRaw.mockRejectedValue(new Error('connection refused'));

    await expect(service.check()).resolves.toMatchObject({ status: 'error', db: 'down' });
  });
});
