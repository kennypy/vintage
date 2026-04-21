import { IsEmail, IsString, MinLength, MaxLength, Matches, IsOptional, IsBoolean, Equals, IsDateString } from 'class-validator';
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

  // Birth date is required to enforce the 18+ age gate at registration.
  // Stored on the User row; also used by the Serpro identity check
  // (CPF + name + DOB match). ISO-8601 date format (YYYY-MM-DD).
  @ApiProperty({ example: '1995-06-15', description: 'Data de nascimento (ISO 8601, obrigatório, 18+)' })
  @IsDateString({}, { message: 'Data de nascimento inválida' })
  birthDate!: string;

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

  // Optional invite/referral code from another Vintage.br user. When
  // redeemed it creates a Referral row; reward fires on the referee's
  // first completed order. Case-insensitive — normalised to uppercase
  // in ReferralsService.linkReferralAtSignup.
  @ApiProperty({ example: 'A2B4C6D8', required: false, description: 'Código de indicação (opcional)' })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  referralCode?: string;
}
