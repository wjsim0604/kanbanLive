import { Global, Module } from '@nestjs/common';
import { BoardEventsService } from './board-events.service';

@Global()
@Module({
  providers: [BoardEventsService],
  exports: [BoardEventsService],
})
export class EventsModule {}
