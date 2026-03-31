import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class RecordClickDto {
  @IsString()
  @MaxLength(64)
  impressionId!: string;

  @IsString()
  @MaxLength(64)
  creativeId!: string;

  @IsString()
  @MaxLength(64)
  campaignId!: string;

  // Milliseconds from impression render to click (supplied by frontend)
  // Used as one bot-detection signal: bots click in <100ms
  @IsOptional()
  @IsInt()
  @Min(0)
  msToClick?: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  sessionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  deviceId?: string;
}
