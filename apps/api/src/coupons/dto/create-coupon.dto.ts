import { IsString, Length, IsInt, Min, Max, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCouponDto {
  @ApiProperty({ example: 'TESTE100', description: 'Código único do cupom' })
  @IsString()
  @Length(1, 50)
  code!: string;

  @ApiProperty({ example: 100, description: 'Percentual de desconto (0–100)' })
  @IsInt()
  @Min(1)
  @Max(100)
  discountPct!: number;

  @ApiPropertyOptional({ example: 100, description: 'Número máximo de usos (null = ilimitado)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxUses?: number;

  @ApiPropertyOptional({ example: '2026-12-31T23:59:59.000Z', description: 'Data de expiração (null = nunca expira)' })
  @IsOptional()
  expiresAt?: Date;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
