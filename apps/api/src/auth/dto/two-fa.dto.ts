import { IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyTwoFaDto {
  @ApiProperty({ example: '123456', description: 'Código TOTP de 6 dígitos' })
  @IsString()
  @Length(6, 6)
  token!: string;
}

export class ConfirmLoginTwoFaDto {
  @ApiProperty({ example: 'tmp_abc123', description: 'Token temporário retornado quando 2FA é necessário' })
  @IsString()
  tempToken!: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @Length(6, 6)
  token!: string;
}
