import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

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

  constructor(private configService: ConfigService) {
    this.accessToken = this.configService.get<string>(
      'MERCADOPAGO_ACCESS_TOKEN',
      '',
    );
    this.webhookSecret = this.configService.get<string>(
      'MERCADOPAGO_WEBHOOK_SECRET',
      '',
    );
  }

  private get isConfigured(): boolean {
    return this.accessToken.length > 0;
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
  ) {
    if (!this.isConfigured) {
      return this.mockPixPayment(orderId, amountBrl);
    }

    const idempotencyKey = crypto
      .createHash('sha256')
      .update(`pix:${orderId}:${amountBrl}`)
      .digest('hex');
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
  ) {
    if (!this.isConfigured) {
      return this.mockCardPayment(orderId, amountBrl, installments);
    }

    const idempotencyKey = crypto
      .createHash('sha256')
      .update(`card:${orderId}:${amountBrl}:${installments}:${cardToken}`)
      .digest('hex');
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

    const installmentAmount =
      payment.transaction_details?.installment_amount ??
      Math.ceil((amountBrl / installments) * 100) / 100;
    const total =
      payment.transaction_details?.total_paid_amount ??
      installmentAmount * installments;

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
  ) {
    if (!this.isConfigured) {
      return this.mockBoletoPayment(orderId, amountBrl);
    }

    const idempotencyKey = crypto
      .createHash('sha256')
      .update(`boleto:${orderId}:${amountBrl}`)
      .digest('hex');
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
   * Verify webhook signature using HMAC-SHA256.
   */
  verifyWebhookSignature(payload: string, signature: string): boolean {
    if (!this.webhookSecret) {
      this.logger.warn(
        'Webhook secret not configured — skipping signature verification in dev mode',
      );
      return true;
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
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Refund a payment (full or partial).
   */
  async refundPayment(paymentId: string, amountBrl?: number) {
    if (!this.isConfigured) {
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

  // --------------- Mock implementations for dev mode ---------------

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
