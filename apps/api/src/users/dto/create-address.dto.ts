import { IsString, IsOptional, IsBoolean, Matches, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CEP_REGEX } from '@vintage/shared';

export class CreateAddressDto {
  @ApiProperty({ example: 'Casa' })
  @IsString()
  @MaxLength(50)
  label!: string;

  @ApiProperty({ example: 'Rua das Flores' })
  @IsString()
  @MaxLength(200)
  street!: string;

  @ApiProperty({ example: '123' })
  @IsString()
  @MaxLength(20)
  number!: string;

  @ApiPropertyOptional({ example: 'Apto 42' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  complement?: string;

  @ApiProperty({ example: 'Jardim Paulista' })
  @IsString()
  @MaxLength(100)
  neighborhood!: string;

  @ApiProperty({ example: 'São Paulo' })
  @IsString()
  @MaxLength(100)
  city!: string;

  @ApiProperty({ example: 'SP' })
  @IsString()
  @Matches(/^[A-Z]{2}$/, { message: 'Estado deve ter 2 letras maiúsculas' })
  state!: string;

  @ApiProperty({ example: '01234-567' })
  @IsString()
  @Matches(CEP_REGEX, { message: 'CEP inválido (formato: XXXXX-XXX)' })
  cep!: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
