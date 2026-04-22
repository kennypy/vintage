import { IsString, IsEnum, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Carrier } from '@prisma/client';

// Carrier is re-exported from `@prisma/client` so validation stays in
// sync with the DB enum. A local hand-rolled copy used to omit PEGAKI,
// which meant sellers picking Pegaki got a 400 here even though
// ShippingService + PegakiClient are fully wired.

export class ShipOrderDto {
  @ApiProperty({ example: 'BR123456789XX', description: 'Código de rastreamento' })
  @IsString()
  @MaxLength(50)
  trackingCode!: string;

  @ApiProperty({ enum: Carrier, example: 'CORREIOS', description: 'Transportadora' })
  @IsEnum(Carrier)
  carrier!: Carrier;
}
