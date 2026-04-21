import { IsEnum, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Payload for POST /payments/:orderId/retry. The orderId comes from
 * the URL; the body declares which method the buyer wants to try next
 * (they may switch from PIX to card after a PIX expiry, for example).
 *
 * method — PIX | CREDIT_CARD | BOLETO (enum matches PaymentMethod)
 * installments — required for CREDIT_CARD, ignored otherwise
 * cardToken — Mercado Pago card token if paying by card
 */
export enum RetryPaymentMethod {
  PIX = 'PIX',
  CREDIT_CARD = 'CREDIT_CARD',
  BOLETO = 'BOLETO',
}

export class RetryPaymentDto {
  @ApiProperty({ enum: RetryPaymentMethod, example: RetryPaymentMethod.PIX })
  @IsEnum(RetryPaymentMethod)
  method!: RetryPaymentMethod;

  @ApiProperty({ example: 3, required: false, description: 'Parcelas (apenas para CREDIT_CARD, 1..12)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  installments?: number;

  @ApiProperty({ example: 'tok_abc', required: false, description: 'Mercado Pago card token (CREDIT_CARD)' })
  @IsOptional()
  @IsString()
  @Length(1, 256)
  cardToken?: string;
}
