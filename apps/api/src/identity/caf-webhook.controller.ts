import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CafClient, CafWebhookPayload } from './caf.client';
import { IdentityService } from './identity.service';

/**
 * Inbound webhook endpoint for Caf document+liveness result
 * notifications. Caf POSTs here after the user finishes the
 * selfie + doc capture at the redirect URL we handed them from
 * `/users/me/verify-identity-document`.
 *
 * Security posture (per CLAUDE.md §Webhook Signatures):
 *   - HMAC-SHA256 verified against CAF_WEBHOOK_SECRET. Constant-
 *     time comparison inside CafClient.
 *   - Rejects with 401 when the signature doesn't verify OR the
 *     secret isn't configured. Never trust-by-default.
 *   - Payload validation is strict: `sessionId` + `status` are
 *     required. Everything else is optional.
 *   - Dedup via ProcessedWebhook (same pattern as MP, f663e72).
 *     Service-layer catches P2002 and returns { duplicate: true }.
 *
 * Signature is computed against `JSON.stringify(body)` — matches
 * the MercadoPago webhook pattern already in use
 * (payments.service.ts:128). Minor risk: a Caf-side field-order
 * change could break verification. Mitigation is flipping to
 * raw-body capture (`NestFactory.create(..., { rawBody: true })`)
 * if we ever see signature drift in practice.
 */
@ApiTags('webhooks')
@Controller('webhooks/caf')
export class CafWebhookController {
  constructor(
    private readonly caf: CafClient,
    private readonly identity: IdentityService,
  ) {}

  @Post()
  @HttpCode(200)
  @ApiOperation({ summary: 'Webhook de resultado do Caf (HMAC-verified)' })
  async handle(
    @Headers('x-caf-signature') signature: string | undefined,
    @Body() body: CafWebhookPayload,
  ) {
    if (!body) {
      throw new BadRequestException('Payload do webhook ausente.');
    }
    const payloadStr = JSON.stringify(body);
    if (!this.caf.verifyWebhookSignature(payloadStr, signature)) {
      throw new UnauthorizedException('Assinatura do webhook inválida.');
    }
    if (!body.sessionId || !body.status) {
      throw new BadRequestException('Payload do webhook inválido.');
    }
    return this.identity.handleCafWebhook(body);
  }
}
