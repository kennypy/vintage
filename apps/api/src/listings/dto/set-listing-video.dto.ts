import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Max stored URL length. Well above any real S3/CDN key, well below
 *  anything that costs us to store or serve. */
const MAX_URL_LENGTH = 2048;

export class SetListingVideoDto {
  @ApiProperty({ description: 'URL devolvida por /uploads/listing-video' })
  @IsString()
  @MaxLength(MAX_URL_LENGTH)
  videoUrl!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(MAX_URL_LENGTH)
  thumbnailUrl?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 30 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  durationSeconds?: number;
}
