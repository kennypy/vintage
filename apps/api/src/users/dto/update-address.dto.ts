import { IsString, IsOptional, IsBoolean, Matches, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CEP_REGEX } from '@vintage/shared';

export class UpdateAddressDto {
  @ApiPropertyOptional({ example: 'Casa' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  label?: string;

  @ApiPropertyOptional({ example: 'Rua das Flores' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  street?: string;

  @ApiPropertyOptional({ example: '123' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  number?: string;

  @ApiPropertyOptional({ example: 'Apto 42' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  complement?: string;

  @ApiPropertyOptional({ example: 'Jardim Paulista' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  neighborhood?: string;

  @ApiPropertyOptional({ example: 'São Paulo' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional({ example: 'SP' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{2}$/, { message: 'Estado deve ter 2 letras maiúsculas' })
  state?: string;

  @ApiPropertyOptional({ example: '01234-567' })
  @IsOptional()
  @IsString()
  @Matches(CEP_REGEX, { message: 'CEP inválido (formato: XXXXX-XXX)' })
  cep?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
