import { IsEnum, IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { DisputeReason } from '@prisma/client';

/**
 * Payload for POST /returns. The orderId identifies the order being
 * returned (buyer must own it). `reason` reuses DisputeReason because
 * the same taxonomy covers returns and disputes — a return that the
 * seller rejects escalates into a Dispute carrying the same reason.
 */
export class CreateReturnDto {
  @ApiProperty({ example: 'cmo62a5st0004ubgk54v5yv4j', description: 'ID do pedido' })
  @IsString()
  @Length(8, 128)
  orderId!: string;

  @ApiProperty({ enum: DisputeReason })
  @IsEnum(DisputeReason)
  reason!: DisputeReason;

  @ApiProperty({ example: 'Produto não corresponde ao anúncio', description: 'Motivo detalhado' })
  @IsString()
  @Length(10, 2000)
  description!: string;
}
