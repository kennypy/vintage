import { IsEnum, IsOptional, IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Carrier } from '@prisma/client';

/**
 * Payload for PATCH /returns/:id/approve. Seller picks the return
 * carrier so the ShippingService can generate an inverted-address
 * label (buyer → seller). Carrier defaults to CORREIOS if omitted.
 */
export class ApproveReturnDto {
  @ApiProperty({ enum: Carrier, required: false })
  @IsOptional()
  @IsEnum(Carrier)
  carrier?: Carrier;
}

export class RejectReturnDto {
  @ApiProperty({ example: 'Item fora do prazo de garantia', description: 'Motivo da recusa (escalará para disputa)' })
  @IsString()
  @Length(10, 2000)
  reason!: string;
}

export class InspectReturnDto {
  @ApiProperty({ example: 'Item recebido em condições acordadas', required: false })
  @IsOptional()
  @IsString()
  @Length(1, 2000)
  note?: string;
}
