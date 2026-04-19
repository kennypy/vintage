import { IsBoolean, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Admin body for `POST /disputes/:id/resolve`. Previously the handler
 * accepted a bare `{ resolution: string; refund: boolean }` typed only
 * in TypeScript — the global ValidationPipe's `forbidNonWhitelisted`
 * flag only fires when a DTO class is attached, so any shape (missing
 * fields, huge `resolution`, truthy non-boolean `refund`) slipped
 * through. Admin-only, so the blast radius was narrow; but the
 * resolution string is written to the DB and surfaced in the audit
 * feed, and an unbounded write is exactly the kind of thing a
 * compromised admin session can abuse. Red-team finding R-08.
 */
export class ResolveDisputeDto {
  @ApiProperty({
    example: 'Vendedor enviou item conforme descrito; comprador não comprovou dano.',
    description: 'Justificativa da decisão, 1..2000 chars. Fica no histórico.',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  resolution!: string;

  @ApiProperty({
    example: false,
    description: 'true = buyer wins (refund); false = seller wins (release escrow).',
  })
  @IsBoolean()
  refund!: boolean;
}
