import {
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';
import { AdFormat } from '@prisma/client';

export class CreateCreativeDto {
  @IsString()
  @MaxLength(128)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  body?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(1024)
  imageUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  ctaText?: string;

  // Destination URL — validated for SSRF at the service layer
  @IsUrl({ require_tld: false })
  @MaxLength(2048)
  destinationUrl!: string;

  @IsEnum(AdFormat)
  format!: AdFormat;
}
