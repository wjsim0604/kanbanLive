import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { CardDetailDto, CardDto, CommentDto } from '@kanban/shared';
import { CurrentUser, type AuthUser } from '../common/current-user.decorator';
import { CardsService } from './cards.service';
import { CreateCardDto, CreateCommentDto, MoveCardDto, UpdateCardDto } from './dto';

@ApiTags('cards')
@ApiBearerAuth()
@Controller()
export class CardsController {
  constructor(private readonly cards: CardsService) {}

  @Post('lists/:listId/cards')
  create(
    @CurrentUser() user: AuthUser,
    @Param('listId', ParseUUIDPipe) listId: string,
    @Body() dto: CreateCardDto,
  ): Promise<CardDto> {
    return this.cards.create(user.id, listId, dto);
  }

  @Get('cards/:id')
  get(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CardDetailDto> {
    return this.cards.get(user.id, id);
  }

  @Patch('cards/:id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCardDto,
  ): Promise<CardDto> {
    return this.cards.update(user.id, id, dto);
  }

  @Post('cards/:id/move')
  @HttpCode(200)
  move(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MoveCardDto,
  ): Promise<CardDto> {
    return this.cards.move(user.id, id, dto);
  }

  @Delete('cards/:id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.cards.remove(user.id, id);
  }

  @Post('cards/:id/comments')
  addComment(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateCommentDto,
  ): Promise<CommentDto> {
    return this.cards.addComment(user.id, id, dto);
  }
}
