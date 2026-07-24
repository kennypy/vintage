import { IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AcceptTosDto {
  @ApiProperty({ example: '2026-01-15' })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  tosVersion!: string;
}
