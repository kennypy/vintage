import { IsEnum, IsString, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum ReportTargetType {
  LISTING = 'listing',
  MESSAGE = 'message',
  USER = 'user',
  REVIEW = 'review',
}

export enum ReportReason {
  SPAM = 'spam',
  COUNTERFEIT = 'counterfeit',
  INAPPROPRIATE = 'inappropriate',
  FRAUD = 'fraud',
  HARASSMENT = 'harassment',
  OTHER = 'other',
}

export class CreateReportDto {
  @ApiProperty({ enum: ReportTargetType, description: 'Tipo do alvo da denúncia' })
  @IsEnum(ReportTargetType)
  targetType!: ReportTargetType;

  @ApiProperty({ description: 'ID do alvo (anúncio, mensagem, usuário ou avaliação)' })
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
