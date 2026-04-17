import { IsString, Length, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyTwoFaDto {
  @ApiProperty({ example: '123456', description: 'Código 2FA de 6 dígitos (TOTP ou SMS)' })
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

export class ResendLoginSmsDto {
  @ApiProperty({ example: 'tmp_abc123', description: 'Token temporário do login inicial' })
  @IsString()
  tempToken!: string;
}

export class SetupSmsDto {
  @ApiProperty({ example: '+5511999998888', description: 'Telefone em formato E.164' })
  @IsString()
  @Matches(/^\+[1-9]\d{7,14}$/, {
    message: 'Telefone deve estar em formato E.164 (ex: +5511999998888).',
  })
  phone!: string;
}
