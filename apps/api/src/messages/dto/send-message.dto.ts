import { IsOptional, IsString, IsUrl, Length } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Mirrors the WS-gateway shape validation (apps/api/src/messages/
 * messages.gateway.ts MAX_MESSAGE_BODY_CHARS). Keeping both paths on
 * the same 4000-char ceiling avoids a class of "can send via HTTP
 * but not via WS" oddities.
 */
export class SendMessageDto {
  @ApiProperty({ description: 'Corpo da mensagem em texto plano.' })
  @IsString()
  @Length(1, 4000, { message: 'body deve ter entre 1 e 4000 caracteres.' })
  body!: string;

  @ApiPropertyOptional({ description: 'URL opcional de uma imagem anexada.' })
  @IsOptional()
  @IsString()
  @IsUrl({ require_protocol: true })
  @Length(1, 1024)
  imageUrl?: string;
}
