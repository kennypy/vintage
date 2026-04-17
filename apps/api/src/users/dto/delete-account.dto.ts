import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class DeleteAccountDto {
  @ApiPropertyOptional({
    description:
      'Senha atual — obrigatória para contas com senha. Contas OAuth puras devem enviar confirmToken.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  password?: string;

  @ApiPropertyOptional({
    description:
      'Código de 6 dígitos recebido por email (para contas sem senha, cadastradas via Google/Apple).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  confirmToken?: string;

  @ApiPropertyOptional({ description: 'Motivo opcional da exclusão', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
