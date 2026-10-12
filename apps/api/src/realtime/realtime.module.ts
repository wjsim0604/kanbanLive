import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CardsModule } from '../cards/cards.module';
import { ListsModule } from '../lists/lists.module';
import { BoardGateway } from './board.gateway';

@Module({
  imports: [AuthModule, ListsModule, CardsModule],
  providers: [BoardGateway],
})
export class RealtimeModule {}
