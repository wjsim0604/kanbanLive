import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { BoardsModule } from './boards/boards.module';
import { CardsModule } from './cards/cards.module';
import { AppConfigModule } from './common/config.module';
import { AppLoggerModule } from './common/logging.module';
import { EventsModule } from './events/events.module';
import { HealthModule } from './health/health.module';
import { ListsModule } from './lists/lists.module';
import { PrismaModule } from './prisma/prisma.module';
import { RealtimeModule } from './realtime/realtime.module';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [
    AppLoggerModule,
    AppConfigModule,
    PrismaModule,
    RedisModule,
    EventsModule,
    AuthModule,
    BoardsModule,
    ListsModule,
    CardsModule,
    HealthModule,
    RealtimeModule,
  ],
})
export class AppModule {}
