import { IsString, Length, IsNumber, IsPositive } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ValidateCouponDto {
  @ApiProperty({ example: 'TESTE100', description: 'Código do cupom' })
  @IsString()
  @Length(1, 50)
  code!: string;

  @ApiProperty({ example: 149.9, description: 'Valor total do pedido antes do desconto (BRL)' })
  @IsNumber()
  @IsPositive()
  orderTotal!: number;
}
