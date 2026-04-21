import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Partial update of the user's notification preferences. Any field left
 * undefined is unchanged. The shape mirrors the web's
 * NotificationPreferences interface (apps/web/src/app/notifications/page.tsx)
 * so the client can PATCH with whatever it toggled.
 */
export class UpdateNotificationPreferencesDto {
  // ── Channel toggles ─────────────────────────────────────────────────
  @ApiPropertyOptional({ description: 'Receber notificações push (mobile)' })
  @IsOptional()
  @IsBoolean()
  pushEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Receber e-mails de marketing e notificações (receipts transacionais sempre enviam)' })
  @IsOptional()
  @IsBoolean()
  emailEnabled?: boolean;

  // ── Category toggles ────────────────────────────────────────────────
  @ApiPropertyOptional({ description: 'Notificações sobre pedidos (nova venda, envio, entrega)' })
  @IsOptional()
  @IsBoolean()
  orders?: boolean;

  @ApiPropertyOptional({ description: 'Notificações de mensagens no chat' })
  @IsOptional()
  @IsBoolean()
  messages?: boolean;

  @ApiPropertyOptional({ description: 'Notificações sobre ofertas recebidas ou aceitas' })
  @IsOptional()
  @IsBoolean()
  offers?: boolean;

  @ApiPropertyOptional({ description: 'Notificações quando alguém começa a te seguir' })
  @IsOptional()
  @IsBoolean()
  followers?: boolean;

  @ApiPropertyOptional({ description: 'Alertas de queda de preço em itens favoritos' })
  @IsOptional()
  @IsBoolean()
  priceDrops?: boolean;

  @ApiPropertyOptional({ description: 'Promoções do Vintage.br' })
  @IsOptional()
  @IsBoolean()
  promotions?: boolean;

  @ApiPropertyOptional({ description: 'Novidades e atualizações da plataforma' })
  @IsOptional()
  @IsBoolean()
  news?: boolean;

  @ApiPropertyOptional({ description: 'Notificações quando você recebe uma nova avaliação' })
  @IsOptional()
  @IsBoolean()
  reviews?: boolean;

  @ApiPropertyOptional({ description: 'Notificações quando alguém favorita um item seu' })
  @IsOptional()
  @IsBoolean()
  favorites?: boolean;

  @ApiPropertyOptional({
    description:
      'Limite diário de pushes por categoria. 0 = sem limite. Acima do limite, a entrada ainda aparece na sineta mas o push é suprimido.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  dailyCap?: number;
}
