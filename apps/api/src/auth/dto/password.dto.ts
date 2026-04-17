import { IsEmail, IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ForgotPasswordDto {
  @ApiProperty({ example: 'maria@example.com' })
  @IsEmail({}, { message: 'Email inválido' })
  email!: string;
}

export class ResetPasswordDto {
  @ApiProperty({ description: 'Token recebido por email', example: 'a1b2c3d4...' })
  @IsString()
  @MinLength(32)
  @MaxLength(256)
  token!: string;

  @ApiProperty({ description: 'Nova senha (mín. 8 caracteres)' })
  @IsString()
  @MinLength(8, { message: 'A senha deve ter pelo menos 8 caracteres' })
  @MaxLength(128)
  newPassword!: string;
}

export class ChangePasswordDto {
  @ApiProperty({ description: 'Senha atual' })
  @IsString()
  @MinLength(1)
  currentPassword!: string;

  @ApiProperty({ description: 'Nova senha (mín. 8 caracteres)' })
  @IsString()
  @MinLength(8, { message: 'A nova senha deve ter pelo menos 8 caracteres' })
  @MaxLength(128)
  newPassword!: string;
}
