import { IsEnum, IsString, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum ReportTargetType {
  LISTING = 'listing',
  USER = 'user',
}

export enum ReportReason {
  COUNTERFEIT = 'counterfeit',
  INAPPROPRIATE = 'inappropriate',
  SPAM = 'spam',
  HARASSMENT = 'harassment',
  OTHER = 'other',
}

export class CreateReportDto {
  @ApiProperty({ enum: ReportTargetType, description: 'Tipo do alvo da denúncia' })
  @IsEnum(ReportTargetType)
  targetType!: ReportTargetType;

  @ApiProperty({ description: 'ID do alvo (anúncio ou usuário)' })
  @IsString()
  targetId!: string;

  @ApiProperty({ enum: ReportReason, description: 'Motivo da denúncia' })
  @IsEnum(ReportReason)
  reason!: ReportReason;

  @ApiPropertyOptional({ maxLength: 500, description: 'Descrição adicional' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
