import { IsString, IsEnum, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

enum Carrier {
  CORREIOS = 'CORREIOS',
  SEDEX = 'SEDEX',
  PAC = 'PAC',
  JADLOG = 'JADLOG',
  KANGU = 'KANGU',
}

export class ShipOrderDto {
  @ApiProperty({ example: 'BR123456789XX', description: 'Código de rastreamento' })
  @IsString()
  @MaxLength(50)
  trackingCode!: string;

  @ApiProperty({ enum: Carrier, example: 'CORREIOS', description: 'Transportadora' })
  @IsEnum(Carrier)
  carrier!: Carrier;
}
