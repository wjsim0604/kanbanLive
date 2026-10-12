import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateListDto {
  @ApiProperty({ example: '할 일' })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  title!: string;
}

export class UpdateListDto extends CreateListDto {}

export class MoveListDto {
  @ApiPropertyOptional({
    description: '이동 후 바로 왼쪽에 올 리스트 id (맨 앞이면 null)',
    nullable: true,
  })
  @IsOptional()
  @IsUUID()
  beforeListId?: string | null;

  @ApiPropertyOptional({
    description: '이동 후 바로 오른쪽에 올 리스트 id (맨 뒤면 null)',
    nullable: true,
  })
  @IsOptional()
  @IsUUID()
  afterListId?: string | null;
}
