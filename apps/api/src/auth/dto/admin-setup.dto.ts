import { IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AdminSetupDto {
  @ApiProperty({ example: 'chave-de-bootstrap' })
  @IsString()
  @Length(1, 256)
  setupKey!: string;
}
