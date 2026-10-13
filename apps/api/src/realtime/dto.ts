import { IsInt, IsOptional, IsUUID, Min } from 'class-validator';
import { CreateCardDto, CreateCommentDto, MoveCardDto, UpdateCardDto } from '../cards/dto';
import { CreateListDto, MoveListDto, UpdateListDto } from '../lists/dto';

/** 소켓 이벤트 페이로드 DTO. REST DTO에 대상 id 필드를 더한다. */

export class BoardRefDto {
  @IsUUID()
  boardId!: string;
}

export class JoinBoardDto extends BoardRefDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  lastSeq?: number;
}

export class SyncDto extends BoardRefDto {
  @IsInt()
  @Min(0)
  lastSeq!: number;
}

export class SocketMoveCardDto extends MoveCardDto {
  @IsUUID()
  boardId!: string;

  @IsUUID()
  cardId!: string;
}

export class SocketUpdateCardDto extends UpdateCardDto {
  @IsUUID()
  boardId!: string;

  @IsUUID()
  cardId!: string;
}

export class SocketCreateCardDto extends CreateCardDto {
  @IsUUID()
  boardId!: string;

  @IsUUID()
  listId!: string;
}

export class SocketCardRefDto extends BoardRefDto {
  @IsUUID()
  cardId!: string;
}

export class SocketAddCommentDto extends CreateCommentDto {
  @IsUUID()
  boardId!: string;

  @IsUUID()
  cardId!: string;
}

export class SocketCreateListDto extends CreateListDto {
  @IsUUID()
  boardId!: string;
}

export class SocketUpdateListDto extends UpdateListDto {
  @IsUUID()
  boardId!: string;

  @IsUUID()
  listId!: string;
}

export class SocketMoveListDto extends MoveListDto {
  @IsUUID()
  boardId!: string;

  @IsUUID()
  listId!: string;
}

export class SocketListRefDto extends BoardRefDto {
  @IsUUID()
  listId!: string;
}
