import { IsEnum, IsOptional, IsString, MaxLength, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum ResolveAction {
  RESOLVE = 'resolve',
  DISMISS = 'dismiss',
}

export class ResolveReportDto {
  @ApiProperty({ enum: ResolveAction, description: 'Decisão do administrador' })
  @IsEnum(ResolveAction)
  action!: ResolveAction;

  @ApiPropertyOptional({
    description:
      'Se true e action=resolve, também esconde/remove o alvo (anúncio DELETED, usuário banido).',
  })
  @IsOptional()
  @IsBoolean()
  hideTarget?: boolean;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
