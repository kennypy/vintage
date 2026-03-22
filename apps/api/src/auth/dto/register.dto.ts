import { IsEmail, IsString, MinLength, MaxLength, Matches, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { CPF_REGEX } from '@vintage/shared';

export class RegisterDto {
  @ApiProperty({ example: 'maria@example.com' })
  @IsEmail({}, { message: 'Email inválido' })
  email!: string;

  @ApiProperty({ example: 'SenhaSegura123!' })
  @IsString()
  @MinLength(8, { message: 'Senha deve ter no mínimo 8 caracteres' })
  @MaxLength(128)
  password!: string;

  @ApiProperty({ example: '123.456.789-09' })
  @IsString()
  @Matches(CPF_REGEX, { message: 'Formato de CPF inválido' })
  cpf!: string;

  @ApiProperty({ example: 'Maria Silva' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @ApiProperty({ example: '11999998888', required: false })
  @IsOptional()
  @IsString()
  phone?: string;
}
