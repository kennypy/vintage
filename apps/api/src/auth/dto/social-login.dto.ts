import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Apple and Google identity tokens are compact JWSs — a few hundred bytes
 * to ~2 KB in practice. 8 KB is comfortably above any real token while
 * still bounding what reaches the JWT verifiers.
 */
const MAX_IDENTITY_TOKEN_LENGTH = 8192;

export class AppleCallbackDto {
  @ApiProperty({ description: 'identityToken devolvido pelo Sign in with Apple' })
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_IDENTITY_TOKEN_LENGTH)
  identityToken!: string;

  @ApiPropertyOptional({ example: 'Maria Silva' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;
}

export class GoogleTokenDto {
  @ApiProperty({ description: 'ID token do Google (fluxo mobile)' })
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_IDENTITY_TOKEN_LENGTH)
  idToken!: string;
}
