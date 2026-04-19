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
import { AnalyticsService, AnalyticsEvents } from '../analytics/analytics.service';
import { MercadoPagoClient } from './mercadopago.client';

/** Maximum allowed transaction amount in BRL. Prevents runaway charges. */
const MAX_PAYMENT_AMOUNT_BRL = 10_000;

/**
 * Sentinel thrown from inside the outbox $transaction when Prisma
 * returns P2002 on the ProcessedWebhook insert — i.e. MP has
 * redelivered an event we already processed. Throwing it rolls back
 * the transaction (no duplicate order flip, no duplicate wallet
 * credit); the outer catch swallows it and returns a plain 200 so
 * MP stops retrying. Any OTHER error surfaces normally so the
 * legitimate-but-partial-write case (DB hiccup) rolls back and MP
 * retries cleanly on the next schedule.
 */
class DuplicateWebhookSignal extends Error {
  constructor(public readonly deliveryId: string) {
    super(`duplicate webhook: mercadopago:${deliveryId}`);
    this.name = 'DuplicateWebhookSignal';
  }
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly nodeEnv: string;

  constructor(
    private readonly mercadoPago: MercadoPagoClient,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly analytics: AnalyticsService,
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
    // Dual-payment guard (red-team finding R-04, pen-test track 4).
    // Previously the service overwrote `order.paymentId` on every
    // create{Pix,Card,Boleto} call, orphaning the previous Mercado
    // Pago payment. A buyer who generated a PIX QR then switched to
    // a card (or vice-versa) could end up paying BOTH — MP processes
    // them independently, the webhook for the card flips the order
    // to PAID, and the PIX webhook arrives later with a paymentId that
    // no longer matches `order.paymentId`, so our handler silently
    // records it as a no-op. The buyer is charged twice with no
    // automatic refund. We refuse the second create-payment call
    // when the order already has an active paymentId pending.
    if (order.paymentId) {
      throw new BadRequestException(
        'Já existe um pagamento em andamento para este pedido. Conclua ou cancele o pagamento anterior antes de criar um novo.',
      );
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

  async handleWebhook(
    rawBody: Buffer | undefined,
    payload: Record<string, unknown>,
    signature?: string,
  ) {
    // Signature is MANDATORY in every environment. Dev may configure a
    // known-value webhook secret (e.g. MERCADOPAGO_WEBHOOK_SECRET=test-secret-dev)
    // but the signature still has to verify.
    if (!signature) {
      this.logger.warn('Webhook rejected: missing signature header');
      throw new UnauthorizedException('Assinatura do webhook ausente.');
    }

    // The HMAC is computed against the exact bytes Mercado Pago sent.
    // If raw-body capture didn't run (route never hit the rawBody
    // middleware) refuse rather than fall back to JSON.stringify(parsed)
    // — re-stringifying re-orders keys / changes spacing and either
    // breaks legitimate webhooks or, worse, could quietly accept a
    // crafted payload whose stringified form matches a known signature.
    if (!rawBody || rawBody.length === 0) {
      this.logger.error('Webhook rejected: raw body unavailable for signature verification');
      throw new UnauthorizedException('Assinatura do webhook não pôde ser verificada.');
    }

    const valid = this.mercadoPago.verifyWebhookSignature(rawBody, signature);
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

    // MP redelivers every 5 minutes until it gets a 2xx, and retries
    // 5xx for up to 3 days. The dedup row keyed on (provider, externalEventId)
    // is what turns those retries into no-ops once we've handled a
    // delivery. Prefer the envelope-level `payload.id` (MP's per-delivery
    // id) and fall back to `data.id` for older webhook shapes that don't
    // carry one. Both are stable under retry.
    const deliveryId =
      (payload['id'] as string | undefined) ?? dataId ?? null;
    if (!deliveryId) {
      this.logger.warn('Webhook rejected: no id in payload — cannot dedup');
      throw new BadRequestException('Payload inválido: id ausente.');
    }

    this.logger.log('Webhook received and verified');

    // Fast-path dedup. If the ProcessedWebhook row already exists, we
    // KNOW this delivery has been fully handled — the outbox design
    // below guarantees the row and the side effects commit together,
    // so a present row cannot outrun an absent side effect. Short-
    // circuiting here avoids a wasted Mercado Pago API round-trip on
    // every redelivery of a settled payment (MP retries every 5 min
    // for up to 3 days).
    const already = await this.prisma.processedWebhook.findUnique({
      where: {
        provider_externalEventId: {
          provider: 'mercadopago',
          externalEventId: String(deliveryId),
        },
      },
      select: { id: true },
    });
    if (already) {
      this.logger.log(
        `Webhook duplicate — already processed mercadopago:${deliveryId}`,
      );
      return { received: true, duplicate: true };
    }

    // Route. Each handler makes its dedup row and its side effects
    // commit together — i.e. the ProcessedWebhook insert lives INSIDE
    // the same $transaction as the order / wallet writes. The old flow
    // committed the dedup row first and then did the side effect in a
    // separate transaction, so a crash between the two left the order
    // stuck in PENDING forever while MP happily saw "duplicate" on
    // every retry (pen-test note P-08).
    if (action === 'payment.updated' && dataId) {
      await this.handlePaymentUpdated(String(deliveryId), action, dataId);
    } else {
      // Events we don't act on still deserve a dedup row — otherwise
      // MP will keep redelivering until the 3-day ceiling.
      await this.recordWebhookProcessed(String(deliveryId), action);
    }

    return { received: true };
  }

  /**
   * Commit a dedup row without any side effects. Used for webhook
   * actions we don't care about (everything except `payment.updated`)
   * so MP stops retrying. Treats P2002 as success so concurrent
   * deliveries converge cleanly.
   */
  private async recordWebhookProcessed(
    deliveryId: string,
    action: string,
  ): Promise<void> {
    try {
      await this.prisma.processedWebhook.create({
        data: { provider: 'mercadopago', externalEventId: deliveryId, action },
      });
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code === 'P2002') {
        this.logger.log(
          `Webhook duplicate — already processed mercadopago:${deliveryId}`,
        );
        return;
      }
      throw err;
    }
  }

  /**
   * Handle `payment.updated` deliveries. Single-transaction contract:
   * the ProcessedWebhook row and the order / wallet writes commit
   * together or not at all. A crash after this function returns means
   * MP will retry and see `duplicate`; a crash during the transaction
   * rolls back the dedup row and MP's retry will succeed.
   */
  private async handlePaymentUpdated(
    deliveryId: string,
    action: string,
    paymentId: string,
  ): Promise<void> {
    // Remote status fetch is network I/O — must live outside the
    // database transaction or we'd hold row locks for the RTT.
    const status = await this.mercadoPago.getPaymentStatus(paymentId);
    this.logger.log(`Payment ${paymentId} status updated: ${status.status}`);

    if (status.status !== 'approved') {
      // Anything other than approved (rejected, in_process, cancelled,
      // refunded) we only note for dedup — no order state to flip yet.
      await this.recordWebhookProcessed(deliveryId, action);
      return;
    }

    await this.processApprovedPayment(deliveryId, action, paymentId, status);
  }

  /**
   * Transitions order from PENDING → PAID, opens escrow on the seller's
   * wallet, and commits the ProcessedWebhook dedup row in the same
   * database transaction so that a crash can never leave the dedup
   * row ahead of the side effects.
   *
   * Amount mismatch is still handled BEFORE the transaction — we want
   * the PaymentFlag row and admin notification to survive even though
   * we refuse the payment; and we DO NOT want to record a dedup row
   * on rejection (MP stops retrying on 4xx anyway, and if they do
   * retry we want the flag to fire again on re-evaluation).
   */
  private async processApprovedPayment(
    deliveryId: string,
    action: string,
    paymentId: string,
    paymentDetails: { transaction_amount?: number },
  ) {
    const order = await this.prisma.order.findFirst({
      where: { paymentId, status: 'PENDING' },
      include: { listing: { select: { title: true } } },
    });

    if (!order) {
      // Either a duplicate (we already flipped this one) or the order
      // was never created. Either way, record the dedup row so MP
      // stops retrying — no other state to flip.
      this.logger.log(
        `No PENDING order found for paymentId ${paymentId} — recording dedup row and returning`,
      );
      await this.recordWebhookProcessed(deliveryId, action);
      return;
    }

    // Verify payment amount matches order total. A mismatch is a
    // potentially fraudulent event — flag the order, notify admins,
    // and reject outright. These writes are intentionally OUTSIDE
    // the main $transaction below: we want the flag to survive the
    // rejection (the throw rolls back only the outbox transaction,
    // which we haven't opened yet).
    if (paymentDetails.transaction_amount !== undefined) {
      // Compare in integer centavos. The previous epsilon-of-0.01 check
      // accepted any amount within one centavo of the order total, which
      // floating-point drift across multi-installment / coupon flows
      // could quietly exploit. Integer math removes the ambiguity.
      const paidCentavos = Math.round(paymentDetails.transaction_amount * 100);
      const expectedCentavos = Math.round(Number(order.totalBrl) * 100);
      if (paidCentavos !== expectedCentavos) {
        const reason = `Payment amount mismatch: paid R$${paymentDetails.transaction_amount}, expected R$${order.totalBrl}`;
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

    // Transactional outbox: dedup row + side effects commit or roll
    // back together. Duplicate redeliveries surface as a Prisma P2002
    // on the ProcessedWebhook insert — we catch that *inside* the
    // transaction, flag it with a sentinel, and swallow the sentinel
    // outside so a legitimate duplicate is a silent success.
    try {
      await this.prisma.$transaction(async (tx) => {
        try {
          await tx.processedWebhook.create({
            data: {
              provider: 'mercadopago',
              externalEventId: deliveryId,
              action,
            },
          });
        } catch (err) {
          const code = (err as { code?: string })?.code;
          if (code === 'P2002') {
            // Duplicate — abort the transaction and swallow outside.
            throw new DuplicateWebhookSignal(deliveryId);
          }
          throw err;
        }

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
    } catch (err) {
      if (err instanceof DuplicateWebhookSignal) {
        this.logger.log(
          `Webhook duplicate — already processed mercadopago:${deliveryId}`,
        );
        return;
      }
      throw err;
    }

    this.logger.log(
      `Order ${order.id} marked PAID — R$${itemAmount.toFixed(2)} held in escrow for seller ${order.sellerId}`,
    );

    // Funnel: payment confirmed → escrow opened. Attributed to the
    // buyer because the payment originates there — the analytics
    // slice will join this back to the seller via the orderId.
    this.analytics.capture(order.buyerId, AnalyticsEvents.ORDER_PAID, {
      orderId: order.id,
      sellerId: order.sellerId,
      itemPriceBrl: itemAmount,
      paymentMethod: 'MP',
      paymentId,
    });
  }

  /**
   * Look up a payment's status.
   *
   * Caller MUST own the order the payment is tied to. Pre-fix (red-team
   * R-06, pen-test track 4), the endpoint accepted any paymentId and
   * proxied straight to Mercado Pago, so any authenticated user who
   * could guess or enumerate a paymentId could read the payer's
   * transaction amount, status, and status_detail for someone else's
   * order. We map paymentId → Order → buyerId and refuse if the
   * caller isn't the buyer. Returning 404 on either "no order for
   * this paymentId" OR "order exists but you don't own it" keeps the
   * endpoint from doubling as an ownership oracle.
   */
  async getPaymentStatus(paymentId: string, userId: string) {
    if (!paymentId || typeof paymentId !== 'string' || paymentId.length > 128) {
      throw new BadRequestException('paymentId inválido.');
    }
    const order = await this.prisma.order.findFirst({
      where: { paymentId, buyerId: userId },
      select: { id: true },
    });
    if (!order) {
      throw new NotFoundException('Pagamento não encontrado.');
    }
    return this.mercadoPago.getPaymentStatus(paymentId);
  }

  async refundPayment(paymentId: string, amountBrl?: number) {
    this.logger.log(`Refunding payment ${paymentId}`);
    return this.mercadoPago.refundPayment(paymentId, amountBrl);
  }
}
