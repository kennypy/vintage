import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { PixKeyType } from '@vintage/shared';

// Keep this in lockstep with PayoutMethodType in schema.prisma.
const PIX_KEY_TYPES = ['PIX_CPF', 'PIX_CNPJ', 'PIX_EMAIL', 'PIX_PHONE', 'PIX_RANDOM'] as const;

export class CreatePayoutMethodDto {
  @ApiProperty({ enum: PIX_KEY_TYPES, example: 'PIX_EMAIL' })
  @IsEnum(PIX_KEY_TYPES)
  type!: PixKeyType;

  @ApiProperty({
    description:
      'Chave PIX. CPF/CNPJ apenas números; email minúsculo; telefone com DDI; random UUID v4.',
    example: 'jane@example.com',
  })
  @IsString()
  // 77 is the max length of any PIX key type — cap tighter than class-validator
  // default (Infinity) so bogus payloads can't waste DB row budget.
  @MaxLength(77)
  pixKey!: string;

  @ApiPropertyOptional({ example: 'Conta principal' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  label?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class RequestPayoutDto {
  @ApiProperty({ example: 150.0, description: 'Valor em BRL (reais)' })
  amountBrl!: number;

  @ApiProperty({ example: 'clxabc123…', description: 'ID da chave PIX salva' })
  @IsString()
  payoutMethodId!: string;
}
