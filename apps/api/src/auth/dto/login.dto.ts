import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'maria@example.com' })
  @IsEmail({}, { message: 'Email inválido' })
  email!: string;

  @ApiProperty({ example: 'SenhaSegura123!' })
  @IsString()
  @MinLength(8)
  password!: string;
}
