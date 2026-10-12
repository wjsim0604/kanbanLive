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
import type { BoardMemberDto, BoardSnapshotDto, BoardSummaryDto } from '@kanban/shared';
import { CurrentUser, type AuthUser } from '../common/current-user.decorator';
import { BoardsService } from './boards.service';
import { AddMemberDto, CreateBoardDto, UpdateBoardDto, UpdateMemberDto } from './dto';

@ApiTags('boards')
@ApiBearerAuth()
@Controller('boards')
export class BoardsController {
  constructor(private readonly boards: BoardsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<BoardSummaryDto[]> {
    return this.boards.listForUser(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateBoardDto): Promise<BoardSummaryDto> {
    return this.boards.create(user.id, dto);
  }

  @Get(':id')
  get(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<BoardSnapshotDto> {
    return this.boards.snapshot(user.id, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBoardDto,
  ): Promise<BoardSummaryDto> {
    return this.boards.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.boards.remove(user.id, id);
  }

  @Get(':id/members')
  members(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<BoardMemberDto[]> {
    return this.boards.listMembers(user.id, id);
  }

  @Post(':id/members')
  addMember(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddMemberDto,
  ): Promise<BoardMemberDto> {
    return this.boards.addMember(user.id, id, dto);
  }

  @Patch(':id/members/:userId')
  updateMember(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) memberId: string,
    @Body() dto: UpdateMemberDto,
  ): Promise<BoardMemberDto> {
    return this.boards.updateMember(user.id, id, memberId, dto);
  }

  @Delete(':id/members/:userId')
  @HttpCode(204)
  removeMember(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) memberId: string,
  ): Promise<void> {
    return this.boards.removeMember(user.id, id, memberId);
  }
}
