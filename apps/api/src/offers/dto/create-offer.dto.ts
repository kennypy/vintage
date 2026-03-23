import { IsString, IsNumber, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateOfferDto {
  @ApiProperty({ example: 'clxyz789', description: 'ID do anúncio' })
  @IsString()
  listingId!: string;

  @ApiProperty({ example: 55.0, description: 'Valor da oferta em R$ (mínimo 50% do preço do anúncio)' })
  @IsNumber()
  @Min(0.01)
  amountBrl!: number;
}
