import {
  Injectable,
  Logger,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MercadoPagoClient } from './mercadopago.client';

/** Maximum allowed transaction amount in BRL. Prevents runaway charges. */
const MAX_PAYMENT_AMOUNT_BRL = 10_000;

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly nodeEnv: string;

  constructor(
    private readonly mercadoPago: MercadoPagoClient,
    private readonly configService: ConfigService,
  ) {
    this.nodeEnv = this.configService.get<string>(
      'NODE_ENV',
      'development',
    );
  }

  private validateAmount(amountBrl: number, orderId: string): void {
    if (!Number.isFinite(amountBrl) || amountBrl <= 0) {
      this.logger.warn(
        `Payment rejected for order ${orderId}: invalid amount ${amountBrl}`,
      );
      throw new BadRequestException('Valor de pagamento inválido.');
    }
    if (amountBrl > MAX_PAYMENT_AMOUNT_BRL) {
      this.logger.warn(
        `Payment anomaly detected for order ${orderId}: amount R$${amountBrl} exceeds ceiling R$${MAX_PAYMENT_AMOUNT_BRL}`,
      );
      throw new BadRequestException(
        `Valor máximo por transação é R$${MAX_PAYMENT_AMOUNT_BRL.toLocaleString('pt-BR')}.`,
      );
    }
  }

  async createPixPayment(orderId: string, amountBrl: number) {
    this.validateAmount(amountBrl, orderId);
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
    this.validateAmount(amountBrl, orderId);
    this.logger.log(`Creating card payment for order ${orderId}`);
    return this.mercadoPago.createCardPayment(
      orderId,
      amountBrl,
      installments,
      cardToken ?? '',
    );
  }

  async createBoletoPayment(orderId: string, amountBrl: number) {
    this.validateAmount(amountBrl, orderId);
    this.logger.log(`Creating boleto payment for order ${orderId}`);
    return this.mercadoPago.createBoletoPayment(
      orderId,
      amountBrl,
      `Vintage.br - Pedido ${orderId}`,
    );
  }

  async handleWebhook(payload: Record<string, unknown>, signature?: string) {
    const payloadStr = JSON.stringify(payload);
    const isProduction = this.nodeEnv !== 'development';

    // In production, REQUIRE the signature header
    if (!signature) {
      if (isProduction) {
        this.logger.warn(
          'Webhook rejected: missing signature header in production',
        );
        throw new UnauthorizedException(
          'Assinatura do webhook ausente.',
        );
      }
      // In development, log warning but allow
      this.logger.warn(
        'Webhook signature missing — allowing in development mode',
      );
    }

    // Always verify signature when present
    if (signature) {
      const valid = this.mercadoPago.verifyWebhookSignature(
        payloadStr,
        signature,
      );
      if (!valid) {
        this.logger.warn(
          'Webhook rejected: invalid signature',
        );
        throw new UnauthorizedException(
          'Assinatura do webhook inválida.',
        );
      }
    }

    // Validate payload structure: must have action and data fields
    if (!payload['action'] || !payload['data']) {
      this.logger.warn(
        'Webhook rejected: malformed payload — missing action or data',
      );
      throw new BadRequestException(
        'Payload inválido: campos "action" e "data" são obrigatórios.',
      );
    }

    this.logger.log('Webhook received and verified');

    // Process payment notification
    const action = payload['action'] as string;
    const data = payload['data'] as Record<string, unknown>;
    const dataId = data['id'] as string | undefined;

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
