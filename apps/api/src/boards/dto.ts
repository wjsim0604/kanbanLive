import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsString, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateBoardDto {
  @ApiProperty({ example: '포트폴리오 프로젝트' })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  title!: string;
}

export class UpdateBoardDto extends CreateBoardDto {}

export const ASSIGNABLE_ROLES = ['EDITOR', 'VIEWER'] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export class AddMemberDto {
  @ApiProperty({ example: 'bob@example.com' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  email!: string;

  @ApiProperty({ enum: ASSIGNABLE_ROLES, default: 'EDITOR' })
  @IsIn(ASSIGNABLE_ROLES)
  role: AssignableRole = 'EDITOR';
}

export class UpdateMemberDto {
  @ApiProperty({ enum: ASSIGNABLE_ROLES })
  @IsIn(ASSIGNABLE_ROLES)
  role!: AssignableRole;
}
