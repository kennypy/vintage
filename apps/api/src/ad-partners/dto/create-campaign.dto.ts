import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { AdCampaignStatus } from '@prisma/client';

export class CreateCampaignDto {
  @IsString()
  @MaxLength(128)
  name!: string;

  // Audience targeting criteria — validated structurally by the service
  @IsOptional()
  @IsObject()
  targetAudience?: {
    categoryIds?: string[];
    brandIds?: string[];
    priceMin?: number;
    priceMax?: number;
    sizes?: string[];
    placements?: string[];
  };

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  budgetBrl!: number;

  // Cost per 1000 impressions in BRL
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.01)
  cpmBrl!: number;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @IsOptional()
  @IsEnum(AdCampaignStatus)
  status?: AdCampaignStatus;
}
