import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

const normalizeEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class SignupDto {
  @ApiProperty({ example: 'alice@example.com' })
  @Transform(normalizeEmail)
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 8, example: 'password123' })
  @IsString()
  @MinLength(8)
  @MaxLength(72) // bcrypt 입력 한도
  password!: string;

  @ApiProperty({ example: 'Alice' })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name!: string;
}

export class LoginDto {
  @ApiProperty({ example: 'alice@example.com' })
  @Transform(normalizeEmail)
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'password123' })
  @IsString()
  @MinLength(1)
  password!: string;
}
