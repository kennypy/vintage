import { IsString, IsOptional, IsBoolean, MaxLength, Matches } from 'class-validator';

export class CreateFeatureFlagDto {
  @IsString()
  @MaxLength(100)
  @Matches(/^[a-z][a-z0-9_]*$/, {
    message: 'key must be lowercase snake_case (e.g. video_upload)',
  })
  key!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  metadata?: Record<string, unknown>;
}
