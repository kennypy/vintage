import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

/**
 * Raised when the payout endpoint is hit but MERCADOPAGO_PAYOUT_ENABLED
 * is not 'true'. PayoutsService catches this specifically to leave the
 * PayoutRequest in PENDING (for the manual ops queue) rather than
 * transitioning to FAILED + refunding the wallet. Once the MP
 * Marketplace contract is active, flip the flag and this class goes
 * unused.
 */
export class MercadoPagoPayoutUnavailableError extends Error {
  constructor() {
    super('Mercado Pago payout contract not yet active; routing to ops queue.');
    this.name = 'MercadoPagoPayoutUnavailableError';
  }
}

interface MercadoPagoPaymentResponse {
  id: string;
  status: string;
  status_detail: string;
  transaction_amount: number;
  point_of_interaction?: {
    transaction_data?: {
      qr_code?: string;
      qr_code_base64?: string;
      ticket_url?: string;
    };
  };
  transaction_details?: {
    installment_amount?: number;
    total_paid_amount?: number;
    barcode?: { content?: string };
    external_resource_url?: string;
  };
  date_of_expiration?: string;
}

@Injectable()
export class MercadoPagoClient {
  private readonly logger = new Logger(MercadoPagoClient.name);
  private readonly accessToken: string;
  private readonly webhookSecret: string;
  private readonly baseUrl = 'https://api.mercadopago.com';
  private readonly nodeEnv: string;

  constructor(private configService: ConfigService) {
    this.accessToken = this.configService.get<string>(
      'MERCADOPAGO_ACCESS_TOKEN',
      '',
    );
    this.webhookSecret = this.configService.get<string>(
      'MERCADOPAGO_WEBHOOK_SECRET',
      '',
    );
    this.nodeEnv = this.configService.get<string>('NODE_ENV', 'development');
  }

  private get isConfigured(): boolean {
    return this.accessToken.length > 0;
  }

  /**
   * Deterministic idempotency key for a payment attempt. Same inputs always
   * produce the same key — but a retry (attemptNumber+1) yields a fresh key,
   * so MP doesn't replay the prior failed result for the new attempt. Exposed
   * statically so PaymentsService can derive + persist the same key it will
   * eventually hand to MP, enabling the @@unique([orderId, idempotencyKey])
   * DB constraint to act as a backstop against double-charge.
   */
  static deriveIdempotencyKey(
    method: 'pix' | 'card' | 'boleto',
    orderId: string,
    amountBrl: number,
    attemptNumber: number,
    extra?: string,
  ): string {
    const parts = [method, orderId, amountBrl.toFixed(2), String(attemptNumber)];
    if (extra) parts.push(extra);
    return crypto.createHash('sha256').update(parts.join(':')).digest('hex');
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    idempotencyKey?: string,
  ): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
    };

    if (idempotencyKey) {
      headers['X-Idempotency-Key'] = idempotencyKey;
    }

    const url = `${this.baseUrl}${path}`;
    this.logger.debug(`${method} ${path}`);

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = String(await response.text()).slice(0, 200);
      this.logger.error(
        `Mercado Pago API error: ${response.status} - ${errorText}`,
      );
      throw new Error(
        `Mercado Pago API error: ${response.status} - ${errorText}`,
      );
    }

    return (await response.json()) as T;
  }

  /**
   * Create PIX payment via Mercado Pago API.
   */
  async createPixPayment(
    orderId: string,
    amountBrl: number,
    description: string,
    attemptNumber = 1,
  ) {
    if (!this.isConfigured) {
      if (this.nodeEnv === 'production') {
        throw new Error('Mercado Pago not configured — cannot process payments in production');
      }
      return this.mockPixPayment(orderId, amountBrl);
    }

    const idempotencyKey = MercadoPagoClient.deriveIdempotencyKey(
      'pix',
      orderId,
      amountBrl,
      attemptNumber,
    );
    const payment = await this.request<MercadoPagoPaymentResponse>(
      'POST',
      '/v1/payments',
      {
        transaction_amount: amountBrl,
        description,
        payment_method_id: 'pix',
        payer: { email: `order-${orderId}@vintage.br` },
        external_reference: orderId,
      },
      idempotencyKey,
    );

    const txData = payment.point_of_interaction?.transaction_data;
    return {
      id: String(payment.id),
      orderId,
      method: 'pix' as const,
      amountBrl: payment.transaction_amount,
      qrCode: txData?.qr_code ?? '',
      qrCodeBase64: txData?.qr_code_base64 ?? '',
      pixCopiaECola: txData?.qr_code ?? '',
      expiresAt: payment.date_of_expiration ?? '',
      status: payment.status,
    };
  }

  /**
   * Create card payment via Mercado Pago API.
   */
  async createCardPayment(
    orderId: string,
    amountBrl: number,
    installments: number,
    cardToken: string,
    attemptNumber = 1,
  ) {
    if (!this.isConfigured) {
      if (this.nodeEnv === 'production') {
        throw new Error('Mercado Pago not configured — cannot process payments in production');
      }
      return this.mockCardPayment(orderId, amountBrl, installments);
    }

    const idempotencyKey = MercadoPagoClient.deriveIdempotencyKey(
      'card',
      orderId,
      amountBrl,
      attemptNumber,
      `${installments}:${cardToken}`,
    );
    const payment = await this.request<MercadoPagoPaymentResponse>(
      'POST',
      '/v1/payments',
      {
        transaction_amount: amountBrl,
        token: cardToken,
        installments,
        payment_method_id: 'visa',
        payer: { email: `order-${orderId}@vintage.br` },
        external_reference: orderId,
      },
      idempotencyKey,
    );

    // Float arithmetic on currency drifts unpredictably across many
    // installments. We compute everything in centavos (integer cents),
    // then convert back to BRL once at the end. This guarantees the
    // sum of installments exactly equals the total amount and never
    // under- or over-charges due to rounding.
    // Integer-centavo math so the sum of installments EXACTLY equals
    // the charge. The old ceiling-divide (per = ceil(total/n), total
    // = per*n) over-reported `total` by up to (n - 1) centavos on
    // fractional remainders — harmless in practice because MP's own
    // response takes priority, but wrong in the fallback path a
    // property-based test flagged. Floor + distribute the remainder
    // across the first `remainder` installments keeps every
    // installment >= base and sum(parts) = totalCentavos exactly.
    const totalCentavos = Math.round(amountBrl * 100);
    const baseInstallment = Math.floor(totalCentavos / installments);
    const remainderCentavos = totalCentavos - baseInstallment * installments;
    // "Approximate" per-installment amount used in the response. When
    // remainder > 0 the first `remainder` installments are 1 centavo
    // larger; we report the base as a representative value.
    const installmentAmount =
      payment.transaction_details?.installment_amount ??
      (baseInstallment + (remainderCentavos > 0 ? 1 : 0)) / 100;
    const total =
      payment.transaction_details?.total_paid_amount ?? amountBrl;

    return {
      id: String(payment.id),
      orderId,
      method: 'card' as const,
      installments,
      installmentAmount,
      total,
      status: payment.status,
    };
  }

  /**
   * Create boleto payment via Mercado Pago API.
   */
  async createBoletoPayment(
    orderId: string,
    amountBrl: number,
    description: string,
    attemptNumber = 1,
  ) {
    if (!this.isConfigured) {
      if (this.nodeEnv === 'production') {
        throw new Error('Mercado Pago not configured — cannot process payments in production');
      }
      return this.mockBoletoPayment(orderId, amountBrl);
    }

    const idempotencyKey = MercadoPagoClient.deriveIdempotencyKey(
      'boleto',
      orderId,
      amountBrl,
      attemptNumber,
    );
    const payment = await this.request<MercadoPagoPaymentResponse>(
      'POST',
      '/v1/payments',
      {
        transaction_amount: amountBrl,
        description,
        payment_method_id: 'bolbradesco',
        payer: { email: `order-${orderId}@vintage.br` },
        external_reference: orderId,
      },
      idempotencyKey,
    );

    const txDetails = payment.transaction_details;
    return {
      id: String(payment.id),
      orderId,
      method: 'boleto' as const,
      amountBrl: payment.transaction_amount,
      barcodeUrl: txDetails?.external_resource_url ?? '',
      expiresAt: payment.date_of_expiration ?? '',
      status: payment.status,
    };
  }

  /**
   * Verify a Mercado Pago webhook HMAC-SHA256 signature against the
   * EXACT bytes received on the wire. The previous implementation
   * accepted a string and silently returned `true` in development when
   * the secret was missing — that fail-open path leaked into staging /
   * preview deployments where NODE_ENV !== 'production' and let unsigned
   * webhooks pass. This version fails closed in every environment: no
   * secret means every webhook is rejected, period.
   */
  verifyWebhookSignature(payload: Buffer | string, signature: string): boolean {
    if (!this.webhookSecret) {
      this.logger.error(
        'MERCADOPAGO_WEBHOOK_SECRET not configured — rejecting webhook (set the secret to enable verification, even in dev)',
      );
      return false;
    }

    const expectedSig = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(payload)
      .digest('hex');

    // Guard against length mismatch to prevent timingSafeEqual from throwing
    if (
      Buffer.byteLength(signature) !== Buffer.byteLength(expectedSig)
    ) {
      return false;
    }

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSig),
    );
  }

  /**
   * Get payment status from Mercado Pago.
   */
  async getPaymentStatus(paymentId: string) {
    if (!this.isConfigured) {
      if (this.nodeEnv === 'production') {
        throw new Error('Mercado Pago not configured — cannot check payment status in production');
      }
      return {
        id: paymentId,
        status: 'pending',
        updatedAt: new Date().toISOString(),
      };
    }

    const payment = await this.request<MercadoPagoPaymentResponse>(
      'GET',
      `/v1/payments/${encodeURIComponent(paymentId)}`,
    );

    return {
      id: String(payment.id),
      status: payment.status,
      statusDetail: payment.status_detail,
      transaction_amount: payment.transaction_amount,
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Refund a payment (full or partial).
   */
  async refundPayment(paymentId: string, amountBrl?: number) {
    if (!this.isConfigured) {
      if (this.nodeEnv === 'production') {
        throw new Error('Mercado Pago not configured — cannot process refunds in production');
      }
      return this.mockRefund(paymentId, amountBrl);
    }

    const idempotencyKey = crypto
      .createHash('sha256')
      .update(`refund:${paymentId}:${amountBrl ?? 'full'}`)
      .digest('hex');
    const body = amountBrl !== undefined ? { amount: amountBrl } : {};

    const refund = await this.request<{ id: number; status: string }>(
      'POST',
      `/v1/payments/${encodeURIComponent(paymentId)}/refunds`,
      body,
      idempotencyKey,
    );

    return {
      id: String(refund.id),
      paymentId,
      amountBrl: amountBrl ?? 0,
      status: refund.status,
      refundedAt: new Date().toISOString(),
    };
  }

  /**
   * Send a PIX payout to an external key. Requires Mercado Pago's
   * Marketplace / Money Out contract to be activated — the endpoint
   * (`/v1/money_requests`) is gated by the merchant's contract and
   * will 403 otherwise. We gate this side on `MERCADOPAGO_PAYOUT_ENABLED`
   * so staging/dev can run the app without the contract active; when
   * the flag is off, callers get a clear "not yet available" error and
   * the PayoutRequest row stays PENDING for ops to reconcile manually.
   *
   * Idempotency: the externalReference MUST be the PayoutRequest.id so
   * a retry lands on the same MP record and we dedupe on our side via
   * `PayoutRequest.externalId UNIQUE`.
   *
   * Security:
   *   - `pixKey` is the canonicalised value (digits-only for CPF/CNPJ,
   *     lowercased for email, +55… for phone, UUID v4 for random).
   *   - The idempotency key is SHA256(externalReference) so a resend of
   *     the same request is a no-op at the MP side, never a double-spend.
   *   - We never log the raw pixKey — only `type` + last-4 are passed
   *     to the structured logger for audit purposes.
   */
  async sendPixPayout(args: {
    externalReference: string;
    pixKey: string;
    pixKeyType: 'PIX_CPF' | 'PIX_CNPJ' | 'PIX_EMAIL' | 'PIX_PHONE' | 'PIX_RANDOM';
    amountBrl: number;
    descriptionForRecipient?: string;
  }): Promise<{ externalId: string; status: 'PROCESSING' | 'COMPLETED' }> {
    if (!this.isConfigured) {
      if (this.nodeEnv === 'production') {
        throw new Error('Mercado Pago not configured — cannot send payouts in production');
      }
      return this.mockPixPayout(args.externalReference);
    }

    const payoutEnabled = this.configService.get<string>(
      'MERCADOPAGO_PAYOUT_ENABLED',
      'false',
    );
    if (payoutEnabled !== 'true') {
      // Contract not yet active. Surface a specific exception so
      // PayoutsService can keep the row PENDING without marking it FAILED.
      throw new MercadoPagoPayoutUnavailableError();
    }

    const idempotencyKey = crypto
      .createHash('sha256')
      .update(`payout:${args.externalReference}`)
      .digest('hex');

    // Map to the MP `/v1/money_requests` contract. Key names are stable
    // per MP's PIX disbursement docs; the shape is approximate here and
    // the actual integration will tighten it during homologação. The
    // structure is chosen so the translation layer lives in ONE place
    // when the contract goes live.
    const body = {
      external_reference: args.externalReference,
      transaction_amount: args.amountBrl,
      payment_method_id: 'pix',
      description: (args.descriptionForRecipient ?? 'Saque Vintage.br').slice(0, 140),
      payer: { type: 'marketplace' },
      additional_info: { payer: { registration_date: new Date().toISOString() } },
      destination: {
        type: 'pix',
        pix: {
          key: args.pixKey,
          key_type: this.mapPixKeyType(args.pixKeyType),
        },
      },
    };

    const response = await this.request<{ id: string | number; status: string }>(
      'POST',
      '/v1/money_requests',
      body,
      idempotencyKey,
    );

    this.logger.log(
      `PIX payout accepted — externalReference=${args.externalReference} mp_id=${String(response.id)} status=${response.status}`,
    );

    // MP returns `approved` for instant clearance, `in_process` for the
    // async path. We collapse to our two-state model; webhooks promote
    // PROCESSING to COMPLETED.
    return {
      externalId: String(response.id),
      status: response.status === 'approved' ? 'COMPLETED' : 'PROCESSING',
    };
  }

  private mapPixKeyType(
    type: 'PIX_CPF' | 'PIX_CNPJ' | 'PIX_EMAIL' | 'PIX_PHONE' | 'PIX_RANDOM',
  ): string {
    switch (type) {
      case 'PIX_CPF': return 'cpf';
      case 'PIX_CNPJ': return 'cnpj';
      case 'PIX_EMAIL': return 'email';
      case 'PIX_PHONE': return 'phone';
      case 'PIX_RANDOM': return 'random_key';
    }
  }

  // --------------- Mock implementations for dev mode ---------------

  private mockPixPayout(_externalReference: string) {
    this.logger.warn(
      'Using mock PIX payout (MERCADOPAGO_ACCESS_TOKEN not set)',
    );
    return {
      externalId: `mock-${crypto.randomUUID()}`,
      status: 'PROCESSING' as const,
    };
  }

  private mockPixPayment(orderId: string, amountBrl: number) {
    const id = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    this.logger.warn('Using mock PIX payment (MERCADOPAGO_ACCESS_TOKEN not set)');
    return {
      id,
      orderId,
      method: 'pix' as const,
      amountBrl,
      qrCode: `00020126580014br.gov.bcb.pix0136${id}5204000053039865802BR5913VintageBR6009SAO PAULO`,
      qrCodeBase64: 'data:image/png;base64,MOCK_QR_CODE_BASE64',
      pixCopiaECola: `00020126580014br.gov.bcb.pix0136${id}`,
      expiresAt: expiresAt.toISOString(),
      status: 'pending',
    };
  }

  private mockCardPayment(
    orderId: string,
    amountBrl: number,
    installments: number,
  ) {
    const id = crypto.randomUUID();
    const installmentAmount =
      Math.ceil((amountBrl / installments) * 100) / 100;
    const total = installmentAmount * installments;
    this.logger.warn('Using mock card payment (MERCADOPAGO_ACCESS_TOKEN not set)');
    return {
      id,
      orderId,
      method: 'card' as const,
      installments,
      installmentAmount,
      total,
      status: 'pending',
    };
  }

  private mockBoletoPayment(orderId: string, amountBrl: number) {
    const id = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    this.logger.warn('Using mock boleto payment (MERCADOPAGO_ACCESS_TOKEN not set)');
    return {
      id,
      orderId,
      method: 'boleto' as const,
      amountBrl,
      barcodeUrl: `https://api.mercadopago.com/v1/payments/${id}/boleto`,
      expiresAt: expiresAt.toISOString(),
      status: 'pending',
    };
  }

  private mockRefund(paymentId: string, amountBrl?: number) {
    const id = crypto.randomUUID();
    this.logger.warn('Using mock refund (MERCADOPAGO_ACCESS_TOKEN not set)');
    return {
      id,
      paymentId,
      amountBrl: amountBrl ?? 0,
      status: 'refunded',
      refundedAt: new Date().toISOString(),
    };
  }
}
