import {
  IsString, IsNumber, IsOptional, IsEnum, IsArray, Min, Max, MaxLength, ArrayMaxSize,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

enum ItemCondition {
  NEW_WITH_TAGS = 'NEW_WITH_TAGS',
  NEW_WITHOUT_TAGS = 'NEW_WITHOUT_TAGS',
  VERY_GOOD = 'VERY_GOOD',
  GOOD = 'GOOD',
  SATISFACTORY = 'SATISFACTORY',
}

export class CreateListingDto {
  @ApiProperty({ example: 'Vestido Zara tamanho M' })
  @IsString()
  @MaxLength(200)
  title!: string;

  @ApiProperty({ example: 'Vestido preto, usado 2 vezes, sem defeitos.' })
  @IsString()
  @MaxLength(10000)
  description!: string;

  @ApiProperty({ example: 'clxyz123' })
  @IsString()
  categoryId!: string;

  @ApiPropertyOptional({ example: 'clxyz456' })
  @IsOptional()
  @IsString()
  brandId?: string;

  @ApiProperty({ enum: ItemCondition, example: 'VERY_GOOD' })
  @IsEnum(ItemCondition)
  condition!: ItemCondition;

  @ApiPropertyOptional({ example: 'M' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  size?: string;

  @ApiPropertyOptional({ example: 'Preto' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  color?: string;

  @ApiProperty({ example: 89.9 })
  @IsNumber()
  @Min(1)
  @Max(999999)
  priceBrl!: number;

  @ApiProperty({ example: 300, description: 'Peso em gramas para cálculo de frete' })
  @IsNumber()
  @Min(1)
  @Max(30000)
  shippingWeightG!: number;

  @ApiProperty({ example: ['https://s3.../photo1.jpg'], description: 'URLs das imagens já enviadas' })
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  imageUrls!: string[];
}
