import { IsInt, IsString, Length, Max, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Shared orderId shape used by every payment-create endpoint.
 * `Length(8,128)` lines up with the cuid / nanoid format orders are
 * given; refuses empty strings, whitespace, and pathologically large
 * inputs before the query hits Prisma.
 */
export class CreatePixDto {
  @ApiProperty({ example: 'cmo62a5st0004ubgk54v5yv4j', description: 'ID do pedido' })
  @IsString()
  @Length(8, 128)
  orderId!: string;
}

export class CreateBoletoDto {
  @ApiProperty({ example: 'cmo62a5st0004ubgk54v5yv4j', description: 'ID do pedido' })
  @IsString()
  @Length(8, 128)
  orderId!: string;
}

/**
 * Card payments additionally carry the installment count. Before the
 * red-team pass (R-05) this was a bare `{ installments: number }`
 * shape with zero runtime validation — a client could send 0, -5,
 * Infinity, or 1.5 and the installment math in mercadopago.client.ts
 * would emit NaN / Infinity / negative-ceil values into the MP API
 * request body. We now bound it 1..12 (matching the CreateOrderDto
 * that set order.installments in the first place) and require a
 * positive integer.
 */
export class CreateCardDto {
  @ApiProperty({ example: 'cmo62a5st0004ubgk54v5yv4j', description: 'ID do pedido' })
  @IsString()
  @Length(8, 128)
  orderId!: string;

  @ApiProperty({ example: 3, description: 'Número de parcelas (1..12)' })
  @IsInt()
  @Min(1)
  @Max(12)
  installments!: number;
}
