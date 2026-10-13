import { Global, Module } from '@nestjs/common';
import { BoardWriter } from '../common/board-writer';
import { BoardAccessService } from './board-access.service';
import { BoardsController } from './boards.controller';
import { BoardsService } from './boards.service';

@Global()
@Module({
  controllers: [BoardsController],
  providers: [BoardsService, BoardAccessService, BoardWriter],
  exports: [BoardsService, BoardAccessService, BoardWriter],
})
export class BoardsModule {}
