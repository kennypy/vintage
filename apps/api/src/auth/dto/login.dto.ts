import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'maria@example.com' })
  @IsEmail({}, { message: 'Email inválido' })
  email!: string;

  @ApiProperty({ example: 'SenhaSegura123!' })
  @IsString()
  @MinLength(8)
  password!: string;

  // Cloudflare Turnstile token. Required when CAPTCHA_ENFORCE=true on the
  // server. Declared optional here so mobile clients on pre-captcha
  // releases don't get 400'd by ValidationPipe's forbidNonWhitelisted —
  // the CaptchaGuard does the real enforcement.
  @ApiProperty({ description: 'Cloudflare Turnstile token', required: false })
  @IsOptional()
  @IsString()
  captchaToken?: string;
}
