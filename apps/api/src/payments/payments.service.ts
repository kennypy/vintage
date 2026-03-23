import { Injectable, Logger } from '@nestjs/common';
import { MercadoPagoClient } from './mercadopago.client';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(private readonly mercadoPago: MercadoPagoClient) {}

  async createPixPayment(orderId: string, amountBrl: number) {
    this.logger.log(`Creating PIX payment for order ${orderId}`);
    return this.mercadoPago.createPixPayment(
      orderId,
      amountBrl,
      `Vintage.br - Pedido ${orderId}`,
    );
  }

  async createCardPayment(
    orderId: string,
    amountBrl: number,
    installments: number,
    cardToken?: string,
  ) {
    this.logger.log(`Creating card payment for order ${orderId}`);
    return this.mercadoPago.createCardPayment(
      orderId,
      amountBrl,
      installments,
      cardToken ?? '',
    );
  }

  async createBoletoPayment(orderId: string, amountBrl: number) {
    this.logger.log(`Creating boleto payment for order ${orderId}`);
    return this.mercadoPago.createBoletoPayment(
      orderId,
      amountBrl,
      `Vintage.br - Pedido ${orderId}`,
    );
  }

  async handleWebhook(payload: Record<string, unknown>, signature?: string) {
    const payloadStr = JSON.stringify(payload);

    // Verify webhook signature (HMAC-SHA256)
    if (signature) {
      const valid = this.mercadoPago.verifyWebhookSignature(
        payloadStr,
        signature,
      );
      if (!valid) {
        this.logger.warn('Invalid webhook signature — rejecting');
        return { received: false, error: 'Invalid signature' };
      }
    }

    this.logger.log('Webhook received and verified');

    // Process payment notification
    const action = payload['action'] as string | undefined;
    const dataId = (payload['data'] as Record<string, unknown>)?.['id'] as
      | string
      | undefined;

    if (action === 'payment.updated' && dataId) {
      const status = await this.mercadoPago.getPaymentStatus(dataId);
      this.logger.log(
        `Payment ${dataId} status updated: ${status.status}`,
      );
    }

    return { received: true };
  }

  async getPaymentStatus(paymentId: string) {
    return this.mercadoPago.getPaymentStatus(paymentId);
  }

  async refundPayment(paymentId: string, amountBrl?: number) {
    this.logger.log(`Refunding payment ${paymentId}`);
    return this.mercadoPago.refundPayment(paymentId, amountBrl);
  }
}
