import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

// 연결은 첫 쿼리 시점에 lazy하게 맺는다. DB가 늦게 떠도 API는 기동되고 /health가 down을 보고한다.
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
