import { IsString, IsEnum, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum DisputeReason {
  NOT_AS_DESCRIBED = 'NOT_AS_DESCRIBED',
  DAMAGED = 'DAMAGED',
  COUNTERFEIT = 'COUNTERFEIT',
  NOT_RECEIVED = 'NOT_RECEIVED',
  WRONG_ITEM = 'WRONG_ITEM',
}

export class CreateDisputeDto {
  @ApiProperty({ example: 'clxyz789', description: 'ID do pedido' })
  @IsString()
  orderId!: string;

  @ApiProperty({
    enum: DisputeReason,
    example: DisputeReason.NOT_AS_DESCRIBED,
    description: 'Motivo da disputa',
  })
  @IsEnum(DisputeReason)
  reason!: DisputeReason;

  @ApiProperty({
    example: 'O produto veio com defeito visível na costura',
    description: 'Descrição detalhada do problema (máx. 1000 caracteres)',
  })
  @IsString()
  @MaxLength(1000)
  description!: string;
}
