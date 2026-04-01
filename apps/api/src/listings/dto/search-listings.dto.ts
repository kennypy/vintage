import { IsOptional, IsString, IsNumber, IsEnum, Min, Max } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

enum SortBy {
  NEWEST = 'newest',
  PRICE_ASC = 'price_asc',
  PRICE_DESC = 'price_desc',
  RELEVANCE = 'relevance',
}

export class SearchListingsDto {
  @ApiPropertyOptional({ example: 'vestido zara' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ example: 'clxyz123', description: 'UUID da categoria' })
  @IsOptional()
  @IsString()
  categoryId?: string;

  /** Category name or slug — resolved to ID server-side for web clients */
  @ApiPropertyOptional({ example: 'Vestidos' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ example: 'clxyz456', description: 'UUID da marca' })
  @IsOptional()
  @IsString()
  brandId?: string;

  /** Brand name — resolved to ID server-side for web clients */
  @ApiPropertyOptional({ example: 'Zara' })
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiPropertyOptional({ example: 'VERY_GOOD' })
  @IsOptional()
  @IsString()
  condition?: string;

  @ApiPropertyOptional({ example: 'M' })
  @IsOptional()
  @IsString()
  size?: string;

  @ApiPropertyOptional({ example: 'Preto' })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minPrice?: number;

  @ApiPropertyOptional({ example: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Max(999999)
  maxPrice?: number;

  @ApiPropertyOptional({ enum: SortBy, example: 'newest' })
  @IsOptional()
  @IsEnum(SortBy)
  sort?: SortBy;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @ApiPropertyOptional({ example: 'clxyz789', description: 'Filtrar anúncios por vendedor' })
  @IsOptional()
  @IsString()
  sellerId?: string;
}

