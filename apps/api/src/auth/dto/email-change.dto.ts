import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RequestEmailChangeDto {
  @ApiProperty({ example: 'novo@exemplo.com' })
  @IsEmail()
  newEmail!: string;

  @ApiProperty({ example: 'senha-atual' })
  @IsString()
  @MinLength(1)
  password!: string;
}

export class ConfirmEmailChangeDto {
  @ApiProperty({ example: 'abc123...' })
  @IsString()
  @MinLength(1)
  token!: string;
}
