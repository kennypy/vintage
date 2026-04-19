import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'node:crypto';

/**
 * Caf (combateafraude.com) client for document + liveness KYC.
 * Track C — escalation path when Serpro returns NAME_MISMATCH /
 * CPF_SUSPENDED or a user disputes the outcome.
 *
 * Flow
 *   1. createSession({ cpf, name, callbackUrl }) → Caf returns
 *      { sessionId, redirectUrl }. We store the mapping and hand
 *      the redirectUrl back to the client (WebView on mobile,
 *      new tab on web).
 *   2. User completes the hosted selfie + RG/CNH flow at the
 *      redirectUrl.
 *   3. Caf POSTs our webhook with the result. Signature is
 *      HMAC-SHA256 in the X-Caf-Signature header.
 *
 * Concrete API paths come from the Caf contract. Base URL +
 * the two path env vars are overridable without recompiling.
 *
 * Fail-closed on every error. We never synthesise success.
 */

const REQUEST_TIMEOUT_MS = 5000;

export interface CreateSessionRequest {
  userId: string;
  cpf: string;
  name: string;
  callbackUrl: string;
}

export interface CreateSessionResponse {
  sessionId: string;
  redirectUrl: string;
}

export type CafWebhookDecision = 'APPROVED' | 'REJECTED' | 'EXPIRED';

export interface CafWebhookPayload {
  /** Delivery id — MP-style dedup key. Used against ProcessedWebhook. */
  eventId?: string;
  sessionId: string;
  status: CafWebhookDecision;
  timestamp?: string;
}

@Injectable()
export class CafClient {
  private readonly logger = new Logger(CafClient.name);

  private readonly baseUrl: string;
  private readonly createSessionPath: string;
  private readonly apiKey: string;
  private readonly webhookSecret: string;
  private readonly configured: boolean;

  constructor(config: ConfigService) {
    this.baseUrl = config.get<string>('CAF_BASE_URL', '').replace(/\/$/, '');
    this.createSessionPath = config.get<string>(
      'CAF_CREATE_SESSION_PATH',
      '/v1/verifications',
    );
    this.apiKey = config.get<string>('CAF_API_KEY', '');
    this.webhookSecret = config.get<string>('CAF_WEBHOOK_SECRET', '');
    this.configured = !!this.baseUrl && !!this.apiKey;

    if (!this.configured) {
      this.logger.warn(
        'Caf not configured (CAF_BASE_URL / CAF_API_KEY missing) — document verification unavailable',
      );
    } else if (!this.webhookSecret) {
      // Loud: without the secret, we can't verify inbound webhooks.
      // Better to refuse them all than to blindly trust anything
      // that POSTs to /webhooks/caf.
      this.logger.error(
        'CAF_API_KEY is set but CAF_WEBHOOK_SECRET is empty — ALL inbound Caf webhooks will be rejected until the secret is provisioned',
      );
    }
  }

  get isConfigured(): boolean {
    return this.configured;
  }

  async createSession(
    req: CreateSessionRequest,
  ): Promise<CreateSessionResponse | null> {
    if (!this.configured) return null;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(
        `${this.baseUrl}${this.createSessionPath}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            // `metadata.userId` is opaque to Caf — we just need it
            // echoed back on the webhook to cross-check against
            // our CafVerificationSession row.
            metadata: { userId: req.userId },
            cpf: req.cpf,
            name: req.name,
            callbackUrl: req.callbackUrl,
          }),
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        this.logger.warn(
          `Caf createSession returned ${response.status}`,
        );
        return null;
      }

      const data = (await response.json()) as {
        sessionId?: string;
        id?: string;
        redirectUrl?: string;
        url?: string;
      };
      // Caf's docs use `sessionId` + `redirectUrl`; the published
      // SDK occasionally uses `id` + `url`. Accept either shape so
      // we don't break when the contract docs diverge.
      const sessionId = data.sessionId ?? data.id;
      const redirectUrl = data.redirectUrl ?? data.url;
      if (!sessionId || !redirectUrl) {
        this.logger.warn(
          `Caf createSession response missing sessionId or redirectUrl`,
        );
        return null;
      }
      return { sessionId, redirectUrl };
    } catch (err) {
      this.logger.warn(
        `Caf createSession threw: ${String(err).slice(0, 200)}`,
      );
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Constant-time HMAC-SHA256 verification of the raw webhook body
   * against the X-Caf-Signature header. Returns false when the
   * secret isn't configured (see the constructor's loud error) —
   * refusing webhooks is safer than trusting them.
   */
  verifyWebhookSignature(rawBody: string, signature: string | undefined): boolean {
    if (!this.webhookSecret || !signature) return false;
    const expected = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(rawBody)
      .digest('hex');
    const expectedBuf = Buffer.from(expected);
    const actualBuf = Buffer.from(signature);
    if (expectedBuf.length !== actualBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, actualBuf);
  }
}
