import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  async createPixPayment(orderId: string, amountBrl: number) {
    const id = randomUUID();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutos

    // TODO: Integrar com Mercado Pago SDK para gerar QR Code PIX real
    return {
      id,
      orderId,
      method: 'pix',
      amountBrl,
      qrCode: `00020126580014br.gov.bcb.pix0136${id}5204000053039865802BR5913VintageBR6009SAO PAULO`,
      qrCodeBase64: 'data:image/png;base64,MOCK_QR_CODE_BASE64',
      pixCopiaECola: `00020126580014br.gov.bcb.pix0136${id}`,
      expiresAt: expiresAt.toISOString(),
      status: 'pending',
    };
  }

  async createCardPayment(
    orderId: string,
    amountBrl: number,
    installments: number,
  ) {
    const id = randomUUID();
    const installmentAmount = Math.ceil((amountBrl / installments) * 100) / 100;
    const total = installmentAmount * installments;

    // TODO: Integrar com Mercado Pago SDK para processar pagamento com cartão
    return {
      id,
      orderId,
      method: 'card',
      installments,
      installmentAmount,
      total,
      status: 'pending',
    };
  }

  async createBoletoPayment(orderId: string, amountBrl: number) {
    const id = randomUUID();
    const expiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); // 3 dias

    // TODO: Integrar com Mercado Pago SDK para gerar boleto real
    return {
      id,
      orderId,
      method: 'boleto',
      amountBrl,
      barcodeUrl: `https://api.mercadopago.com/v1/payments/${id}/boleto`,
      expiresAt: expiresAt.toISOString(),
      status: 'pending',
    };
  }

  async handleWebhook(payload: Record<string, any>) {
    // TODO: Verify Mercado Pago webhook signature (HMAC-SHA256) before processing
    this.logger.log(`Webhook recebido: ${JSON.stringify(payload)}`);

    return { received: true };
  }

  async getPaymentStatus(paymentId: string) {
    // TODO: Consultar status real via Mercado Pago SDK
    return {
      id: paymentId,
      status: 'pending',
      updatedAt: new Date().toISOString(),
    };
  }

  async refundPayment(paymentId: string, amountBrl?: number) {
    const id = randomUUID();

    // TODO: Processar reembolso via Mercado Pago SDK
    return {
      id,
      paymentId,
      amountBrl: amountBrl ?? 0,
      status: 'refunded',
      refundedAt: new Date().toISOString(),
    };
  }
}
