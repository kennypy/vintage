import { IsEmail, IsString, MinLength, MaxLength, Matches, IsOptional, IsBoolean, Equals } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { CPF_REGEX } from '@vintage/shared';

export class RegisterDto {
  @ApiProperty({ example: 'maria@example.com' })
  @IsEmail({}, { message: 'Email inválido' })
  email!: string;

  @ApiProperty({ example: 'SenhaSegura123!' })
  @IsString()
  @MinLength(8, { message: 'Senha deve ter no mínimo 8 caracteres' })
  @MaxLength(128)
  password!: string;

  @ApiProperty({ example: '123.456.789-09' })
  @IsString()
  @Matches(CPF_REGEX, { message: 'Formato de CPF inválido' })
  cpf!: string;

  @ApiProperty({ example: 'Maria Silva' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @ApiProperty({ example: '11999998888', required: false })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({
    description: 'Aceitação obrigatória dos Termos de Uso e Política de Privacidade',
    example: true,
  })
  @IsBoolean({ message: 'Aceite dos termos é obrigatório' })
  @Equals(true, { message: 'Você deve aceitar os Termos de Uso e a Política de Privacidade' })
  acceptedTos!: boolean;

  @ApiProperty({ example: '1.0.0' })
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  tosVersion!: string;

  // Cloudflare Turnstile token — see LoginDto for the ValidationPipe note.
  @ApiProperty({ description: 'Cloudflare Turnstile token', required: false })
  @IsOptional()
  @IsString()
  captchaToken?: string;
}
