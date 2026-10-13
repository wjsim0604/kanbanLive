import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { ListDto } from '@kanban/shared';
import { CurrentUser, type AuthUser } from '../common/current-user.decorator';
import { CreateListDto, MoveListDto, UpdateListDto } from './dto';
import { ListsService } from './lists.service';

@ApiTags('lists')
@ApiBearerAuth()
@Controller()
export class ListsController {
  constructor(private readonly lists: ListsService) {}

  @Post('boards/:boardId/lists')
  create(
    @CurrentUser() user: AuthUser,
    @Param('boardId', ParseUUIDPipe) boardId: string,
    @Body() dto: CreateListDto,
  ): Promise<ListDto> {
    return this.lists.create(user.id, boardId, dto);
  }

  @Patch('lists/:id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateListDto,
  ): Promise<ListDto> {
    return this.lists.update(user.id, id, dto);
  }

  @Post('lists/:id/move')
  @HttpCode(200)
  move(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MoveListDto,
  ): Promise<ListDto> {
    return this.lists.move(user.id, id, dto);
  }

  @Delete('lists/:id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.lists.remove(user.id, id);
  }
}
