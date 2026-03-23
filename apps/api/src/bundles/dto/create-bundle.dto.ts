import { IsString, IsArray, ArrayMinSize } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateBundleDto {
  @ApiProperty({ description: 'ID do vendedor' })
  @IsString()
  sellerId!: string;

  @ApiProperty({ description: 'IDs dos anúncios (mínimo 2)', minItems: 2 })
  @IsArray()
  @ArrayMinSize(2, { message: 'Um pacote deve ter pelo menos 2 anúncios' })
  @IsString({ each: true })
  listingIds!: string[];
}
