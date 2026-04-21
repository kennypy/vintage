import { IsNumber, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Payload for POST /offers/:id/counter. Amount must still respect the
 * 50% floor relative to the listing price. The API infers the next
 * counter-party (seller vs. buyer) from the previous offer in the
 * chain — clients don't get to choose.
 */
export class CounterOfferDto {
  @ApiProperty({ example: 65.0, description: 'Valor da contraproposta em R$' })
  @IsNumber()
  @Min(0.01)
  amountBrl!: number;
}
