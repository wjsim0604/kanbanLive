import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateCardDto {
  @ApiProperty({ example: '로그인 화면 만들기' })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  description?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsUUID()
  assigneeId?: string | null;

  @ApiPropertyOptional({ nullable: true, example: '2026-12-31' })
  @IsOptional()
  @IsDateString()
  dueDate?: string | null;
}

export class UpdateCardDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  description?: string;

  @ApiPropertyOptional({ nullable: true, description: 'null이면 담당자 해제' })
  @IsOptional()
  @IsUUID()
  assigneeId?: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'null이면 마감일 해제' })
  @IsOptional()
  @IsDateString()
  dueDate?: string | null;

  @ApiPropertyOptional({
    description:
      '클라이언트가 수정을 시작한 시점의 version. 서버 version과 다르면 409 VERSION_CONFLICT',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  expectedVersion?: number;
}

export class MoveCardDto {
  @ApiProperty()
  @IsUUID()
  toListId!: string;

  @ApiPropertyOptional({
    description: '이동 후 바로 위에 올 카드 id (맨 위면 null)',
    nullable: true,
  })
  @IsOptional()
  @IsUUID()
  beforeCardId?: string | null;

  @ApiPropertyOptional({
    description: '이동 후 바로 아래에 올 카드 id (맨 아래면 null)',
    nullable: true,
  })
  @IsOptional()
  @IsUUID()
  afterCardId?: string | null;
}

export class CreateCommentDto {
  @ApiProperty({ example: '확인했습니다!' })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(5_000)
  content!: string;
}
