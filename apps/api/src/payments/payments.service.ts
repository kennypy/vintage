import {
  Injectable,
  Logger,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Decimal } from '@prisma/client/runtime/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
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
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {
    this.nodeEnv = this.configService.get<string>(
      'NODE_ENV',
      'development',
    );
  }

  private async getAndValidateOrder(orderId: string, userId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });
    if (!order) {
      throw new NotFoundException('Pedido não encontrado.');
    }
    if (order.buyerId !== userId) {
      throw new ForbiddenException('Acesso negado ao pedido.');
    }
    if (order.status !== 'PENDING') {
      throw new BadRequestException('Pedido já foi pago ou não está pendente.');
    }
    return order;
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

  async createPixPayment(orderId: string, userId: string) {
    const order = await this.getAndValidateOrder(orderId, userId);
    const amountBrl = Number(order.totalBrl);
    this.validateAmount(amountBrl, orderId);
    this.logger.log(`Creating PIX payment for order ${orderId}`);
    const result = await this.mercadoPago.createPixPayment(
      orderId,
      amountBrl,
      `Vintage.br - Pedido ${orderId}`,
    );
    await this.prisma.order.update({
      where: { id: orderId },
      data: { paymentId: String(result.id) },
    });
    return result;
  }

  async createCardPayment(
    orderId: string,
    userId: string,
    installments: number,
    cardToken?: string,
  ) {
    const order = await this.getAndValidateOrder(orderId, userId);
    const amountBrl = Number(order.totalBrl);
    this.validateAmount(amountBrl, orderId);
    this.logger.log(`Creating card payment for order ${orderId}`);
    const result = await this.mercadoPago.createCardPayment(
      orderId,
      amountBrl,
      installments,
      cardToken ?? '',
    );
    await this.prisma.order.update({
      where: { id: orderId },
      data: { paymentId: String(result.id) },
    });
    return result;
  }

  async createBoletoPayment(orderId: string, userId: string) {
    const order = await this.getAndValidateOrder(orderId, userId);
    const amountBrl = Number(order.totalBrl);
    this.validateAmount(amountBrl, orderId);
    this.logger.log(`Creating boleto payment for order ${orderId}`);
    const result = await this.mercadoPago.createBoletoPayment(
      orderId,
      amountBrl,
      `Vintage.br - Pedido ${orderId}`,
    );
    await this.prisma.order.update({
      where: { id: orderId },
      data: { paymentId: String(result.id) },
    });
    return result;
  }

  async handleWebhook(payload: Record<string, unknown>, signature?: string) {
    const payloadStr = JSON.stringify(payload);

    // Signature is MANDATORY in every environment. Dev may configure a
    // known-value webhook secret (e.g. MERCADOPAGO_WEBHOOK_SECRET=test-secret-dev)
    // but the signature still has to verify.
    if (!signature) {
      this.logger.warn('Webhook rejected: missing signature header');
      throw new UnauthorizedException('Assinatura do webhook ausente.');
    }

    const valid = this.mercadoPago.verifyWebhookSignature(payloadStr, signature);
    if (!valid) {
      this.logger.warn('Webhook rejected: invalid signature');
      throw new UnauthorizedException('Assinatura do webhook inválida.');
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

    const action = payload['action'] as string;
    const data = payload['data'] as Record<string, unknown>;
    const dataId = data['id'] as string | undefined;

    // Dedup. MP redelivers every 5 minutes until it gets a 2xx, and
    // retries 5xx for up to 3 days. Without this guard a redelivery of
    // an already-processed `payment.updated` event would re-run
    // processApprovedPayment → re-credit the seller's escrow. We
    // insert a row keyed on the MP-assigned `id` field; the UNIQUE on
    // (provider, externalEventId) rejects duplicates.
    //
    // Prefer `payload.id` (MP's per-delivery id) if present; fall back
    // to `data.id` for older webhook shapes that don't include the
    // delivery-level id. Both are stable under retry.
    const deliveryId =
      (payload['id'] as string | undefined) ?? dataId ?? null;
    if (!deliveryId) {
      this.logger.warn('Webhook rejected: no id in payload — cannot dedup');
      throw new BadRequestException('Payload inválido: id ausente.');
    }
    try {
      await this.prisma.processedWebhook.create({
        data: {
          provider: 'mercadopago',
          externalEventId: String(deliveryId),
          action,
        },
      });
    } catch (err) {
      // P2002 = the (provider, externalEventId) pair already exists,
      // meaning we processed this delivery before. Acknowledge with
      // 200 so MP stops retrying, but do NOT re-run side effects.
      const code = (err as { code?: string })?.code;
      if (code === 'P2002') {
        this.logger.log(
          `Webhook duplicate — already processed mercadopago:${deliveryId}`,
        );
        return { received: true, duplicate: true };
      }
      throw err;
    }

    this.logger.log('Webhook received and verified');

    // Process payment notification
    if (action === 'payment.updated' && dataId) {
      const status = await this.mercadoPago.getPaymentStatus(dataId);
      this.logger.log(
        `Payment ${dataId} status updated: ${status.status}`,
      );

      if (status.status === 'approved') {
        await this.processApprovedPayment(dataId);
      }
    }

    return { received: true };
  }

  /**
   * Transitions order from PENDING → PAID and creates an escrow hold
   * on the seller's wallet (funds in pendingBrl, not balanceBrl).
   */
  private async processApprovedPayment(paymentId: string) {
    const order = await this.prisma.order.findFirst({
      where: { paymentId, status: 'PENDING' },
      include: { listing: { select: { title: true } } },
    });

    if (!order) {
      this.logger.log(
        `No PENDING order found for paymentId ${paymentId} — already processed or missing`,
      );
      return;
    }

    // Verify payment amount matches order total. A mismatch is a potentially
    // fraudulent event — flag the order, notify admins, and reject outright.
    const paymentDetails = await this.mercadoPago.getPaymentStatus(paymentId);
    if (paymentDetails.transaction_amount !== undefined) {
      const orderTotal = Number(order.totalBrl);
      if (Math.abs(paymentDetails.transaction_amount - orderTotal) > 0.01) {
        const reason = `Payment amount mismatch: paid R$${paymentDetails.transaction_amount}, expected R$${orderTotal}`;
        this.logger.error(
          `${reason} for order ${order.id}. Flagged for manual review.`,
        );

        // Record the anomaly for manual review (fire-and-forget log write)
        try {
          await this.prisma.paymentFlag.create({
            data: {
              orderId: order.id,
              paymentId: String(paymentId),
              reason,
            },
          });
        } catch (err) {
          this.logger.warn(
            `Failed to record PaymentFlag for order ${order.id}: ${String(err).slice(0, 200)}`,
          );
        }

        // Notify admins via the notifications channel — non-blocking.
        try {
          const admins = await this.prisma.user.findMany({
            where: { role: 'ADMIN' },
            select: { id: true },
          });
          for (const admin of admins) {
            this.notifications
              .createNotification(
                admin.id,
                'ADMIN_PAYMENT_FLAG',
                'Pagamento com valor divergente',
                reason,
                { orderId: order.id, paymentId },
              )
              .catch(() => {});
          }
        } catch {
          // never let admin notification failure affect webhook response
        }

        throw new BadRequestException(
          'Valor pago não corresponde ao valor do pedido. Pagamento marcado para revisão.',
        );
      }
    }

    const itemAmount = Number(order.itemPriceBrl);

    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: order.id },
        data: { status: 'PAID' },
      });

      const wallet = await tx.wallet.upsert({
        where: { userId: order.sellerId },
        create: { userId: order.sellerId, balanceBrl: 0, pendingBrl: 0 },
        update: {},
      });

      await tx.wallet.update({
        where: { id: wallet.id },
        data: { pendingBrl: { increment: itemAmount } },
      });

      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'ESCROW_HOLD',
          amountBrl: new Decimal(itemAmount.toFixed(2)),
          referenceId: order.id,
          description: `Venda em custódia: ${order.listing.title}`,
        },
      });
    });

    this.logger.log(
      `Order ${order.id} marked PAID — R$${itemAmount.toFixed(2)} held in escrow for seller ${order.sellerId}`,
    );
  }

  async getPaymentStatus(paymentId: string) {
    return this.mercadoPago.getPaymentStatus(paymentId);
  }

  async refundPayment(paymentId: string, amountBrl?: number) {
    this.logger.log(`Refunding payment ${paymentId}`);
    return this.mercadoPago.refundPayment(paymentId, amountBrl);
  }
}
