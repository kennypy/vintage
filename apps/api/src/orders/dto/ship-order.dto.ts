import { IsString, IsEnum, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Carrier } from '@prisma/client';

// Carrier is re-exported from `@prisma/client` so validation stays in
// sync with the DB enum. A local hand-rolled copy used to omit PEGAKI,
// which meant sellers picking Pegaki got a 400 here even though
// ShippingService + PegakiClient are fully wired.

export class ShipOrderDto {
  // Alphanumeric only, mirroring TrackingCodeParam in
  // shipping.controller.ts. @MaxLength(50) alone let a seller put
  // newlines and arbitrary prose in here, and markShipped interpolates
  // the value straight into the WhatsApp/SMS body and the push
  // notification — delivered from Vintage.br's own verified sender, so
  // the buyer cannot tell it from a legitimate platform message. 50
  // characters plus a line break is ample for an off-platform payment
  // redirect, which is exactly the fraud the prohibited-keyword list
  // exists to block.
  @ApiProperty({ example: 'BR123456789XX', description: 'Código de rastreamento' })
  @IsString()
  @Matches(/^[A-Za-z0-9]{6,40}$/, {
    message: 'Código de rastreamento inválido',
  })
  trackingCode!: string;

  @ApiProperty({ enum: Carrier, example: 'CORREIOS', description: 'Transportadora' })
  @IsEnum(Carrier)
  carrier!: Carrier;
}
