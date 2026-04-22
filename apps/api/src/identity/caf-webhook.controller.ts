import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  Post,
  RawBodyRequest,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
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
 * Signature is computed against the raw request bytes captured by
 * `NestFactory.create(..., { rawBody: true })` in main.ts. We do NOT
 * re-stringify the parsed body — field-order / spacing differences
 * would break verification or, worse, accept a forged payload whose
 * stringified form happened to match an older signature. Same pattern
 * as payments.controller.ts:93.
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
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-caf-signature') signature: string | undefined,
    @Body() body: CafWebhookPayload,
  ) {
    if (!body) {
      throw new BadRequestException('Payload do webhook ausente.');
    }
    const raw = req.rawBody;
    if (!raw) {
      throw new BadRequestException('Webhook body not captured.');
    }
    const payloadStr = raw instanceof Buffer ? raw.toString('utf-8') : raw;
    if (!this.caf.verifyWebhookSignature(payloadStr, signature)) {
      throw new UnauthorizedException('Assinatura do webhook inválida.');
    }
    if (!body.sessionId || !body.status) {
      throw new BadRequestException('Payload do webhook inválido.');
    }
    return this.identity.handleCafWebhook(body);
  }
}
