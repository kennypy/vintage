import { IsString, IsOptional, IsBoolean, MaxLength } from 'class-validator';

export class UpdateFeatureFlagDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  metadata?: Record<string, unknown>;
}
