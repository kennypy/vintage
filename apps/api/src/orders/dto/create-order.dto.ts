import { IsString, IsEnum, IsOptional, IsInt, Min, Max, Length } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

enum PaymentMethod {
  PIX = 'PIX',
  CREDIT_CARD = 'CREDIT_CARD',
  BOLETO = 'BOLETO',
}

export class CreateOrderDto {
  @ApiProperty({ example: 'clxyz789', description: 'ID do anúncio' })
  @IsString()
  listingId!: string;

  @ApiProperty({ example: 'clxyz012', description: 'ID do endereço de entrega' })
  @IsString()
  addressId!: string;

  @ApiProperty({ enum: PaymentMethod, example: 'PIX', description: 'Método de pagamento' })
  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  @ApiPropertyOptional({ example: 3, description: 'Número de parcelas (apenas cartão de crédito)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  installments?: number;

  @ApiPropertyOptional({ example: 'TESTE100', description: 'Código de cupom de desconto' })
  @IsOptional()
  @IsString()
  @Length(1, 50)
  couponCode?: string;

  @ApiPropertyOptional({
    example: '8d3d1d6f-55a4-4c3c-9b2f-2f8d4b4a1f0e',
    description: 'Chave de idempotência para evitar criação duplicada de pedidos (UUID recomendado)',
  })
  @IsOptional()
  @IsString()
  @Length(8, 128)
  idempotencyKey?: string;
}
