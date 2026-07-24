import {
  Injectable,
  Logger,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Decimal } from '@prisma/client/runtime/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { warnAndSwallow } from '../common/utils/fire-and-forget';
import { AnalyticsService, AnalyticsEvents } from '../analytics/analytics.service';
import { MetricsService } from '../metrics/metrics.service';
import { MercadoPagoClient } from './mercadopago.client';
import { MAX_PAYMENT_ATTEMPTS } from '@vintage/shared';
import { RetryPaymentDto, RetryPaymentMethod } from './dto/retry-payment.dto';
import { FraudService } from '../fraud/fraud.service';

/** Maximum allowed transaction amount in BRL. Prevents runaway charges. */
const MAX_PAYMENT_AMOUNT_BRL = 10_000;

/**
 * How long a reservation that never reached the provider (PENDING
 * Payment with no providerPaymentId) is treated as still in flight.
 *
 * With the per-attempt AbortSignal in MercadoPagoClient, the worst-case
 * provider call is ~134s (4 x 30s + 2s/4s/8s backoff). Anything older
 * than this window is genuinely stalled — but "stalled" NEVER means
 * "safe to mint". It only means "go ask Mercado Pago what actually
 * happened" (see reconcileOrder). The old behaviour retired stalled rows
 * and minted speculatively, which is precisely how one order ended up
 * with two payable instruments.
 */
const RESERVATION_STALL_MS = 5 * 60 * 1000;

/**
 * PAYMENTS-API-ONLY status sets (`/v1/payments`, Checkout Transparente).
 *
 * Do NOT mix in Orders API (`/v1/orders`) strings: that API has a
 * different taxonomy where `expired` is a top-level status and
 * cancellation is spelled `canceled` (ONE l), versus `cancelled` (TWO l)
 * here. An Orders string leaking into these sets never matches anything,
 * so a terminal instrument silently reads as unclassified and we HOLD
 * forever — a silent misclassification, not a loud failure.
 *
 * Expiry is NOT a status here: an expired PIX surfaces as
 * status `cancelled` with status_detail `expired`.
 */
const MP_LIVE = new Set(['pending', 'in_process', 'authorized', 'in_mediation']);
const MP_SUCCESS_TERMINAL = new Set(['approved']);
const MP_FAILURE_TERMINAL = new Set([
  'rejected',
  'cancelled',
  'refunded',
  'charged_back',
]);

/**
 * Outcome of asking Mercado Pago what exists for an order.
 *
 * `hold` is a first-class result, not an error path: search is
 * eventually consistent, so "nothing found" is indistinguishable from
 * "not indexed yet". Minting into that ambiguity is the double-charge.
 */
type ReconcileOutcome =
  | { action: 'adopt'; detail: MpPaymentDetail }
  | { action: 'mint' }
  | { action: 'hold'; reason: string };

type MpPaymentDetail = NonNullable<
  Awaited<ReturnType<MercadoPagoClient['getPaymentDetail']>>
>;

/**
 * Mercado Pago payment statuses that are terminal failures — once a
 * payment reaches one of these it will never become approved, so the
 * reconciliation poller can safely mark our Payment row FAILED. Note
 * `in_process` / `authorized` / `pending` are NOT here: they are still
 * in flight and must be left for a later reconciliation tick.
 */
const TERMINAL_FAILURE_STATUSES = new Set([
  'rejected',
  'cancelled',
  'refunded',
  'charged_back',
]);

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
    private readonly metrics: MetricsService,
    private readonly fraud: FraudService,
  ) {
    this.nodeEnv = this.configService.get<string>(
      'NODE_ENV',
      'development',
    );
  }

  // (getAndValidateOrder + nextAttemptNumber + recordPaymentAttempt were
  // folded into reserveAttempt() so order read, amount validation, and
  // Payment row insert all happen under the same row lock — defends against
  // R-04 dual-payment AND any future totalBrl-mutation race.)

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

  /**
   * Atomically reserve a Payment slot for a new attempt: read+lock the order,
   * re-validate state and amount under the lock, allocate attemptNumber, derive
   * the deterministic idempotency key, and insert a PENDING Payment row in the
   * SAME transaction. Done before the network call so:
   *
   *   1. The amount the caller will charge is the amount that was on the order
   *      at the moment we authorized the charge — no race with concurrent
   *      mutations (defense in depth; the order schema doesn't currently expose
   *      a totalBrl-mutating endpoint, but locking is cheap and forward-compat).
   *   2. A concurrent second attempt is rejected here, before it can reach
   *      Mercado Pago. NOTE: @@unique([orderId, idempotencyKey]) does NOT
   *      provide this on its own — racing requests allocate different
   *      attemptNumbers, so their derived keys differ and the constraint
   *      never fires. The row lock plus the in-flight PENDING check below
   *      are what actually enforce one live instrument per order.
   *   3. If the network call fails, the PENDING row remains and the retry
   *      flow can advance attemptNumber cleanly.
   */
  private async reserveAttempt(
    orderId: string,
    userId: string,
    method: 'PIX' | 'CREDIT_CARD' | 'BOLETO',
    extra?: string,
  ): Promise<{ amountBrl: number; attemptNumber: number; idempotencyKey: string; paymentId: string }> {
    return this.prisma.$transaction(async (tx) => {
      // Take the row lock BEFORE deciding anything. The lock used to be
      // acquired AFTER the single-active-payment gate, so two concurrent
      // creates both read paymentId === null, both passed the gate, and
      // each reached Mercado Pago with a different idempotency key —
      // minting two independently payable instruments for one order.
      // Money paid against whichever instrument did NOT end up in
      // Order.paymentId is silently swallowed: the order never flips to
      // PAID, the seller is never credited, and neither the webhook nor
      // the reconciliation cron issues a refund.
      const locked = await tx.order.updateMany({
        where: { id: orderId },
        data: { updatedAt: new Date() },
      });
      if (locked.count === 0) throw new NotFoundException('Pedido não encontrado.');

      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order) throw new NotFoundException('Pedido não encontrado.');
      if (order.buyerId !== userId) throw new ForbiddenException('Acesso negado ao pedido.');
      if (order.status !== 'PENDING') {
        throw new BadRequestException('Pedido já foi pago ou não está pendente.');
      }
      if (order.paymentId) {
        throw new BadRequestException(
          'Já existe um pagamento em andamento para este pedido. Conclua ou cancele o pagamento anterior antes de criar um novo.',
        );
      }

      // NOTE: stalled reservations are NOT retired here any more. Doing
      // that let us mint a fresh instrument on the assumption the old one
      // never landed — an assumption we cannot make, because the provider
      // call may have succeeded after we stopped waiting. Reconciliation
      // against MP happens in reconcileBeforeMint(), BEFORE this
      // transaction, and only its verdict may clear the way to mint.

      // Order.paymentId is only written by finalizeAttempt, AFTER the
      // provider call returns, so it cannot serve as the mutex between
      // two requests racing before either has called out. A live PENDING
      // Payment row is the authoritative "an attempt is already in
      // flight" signal, and we create one below inside this same lock.
      const inFlight = await tx.payment.count({
        where: { orderId, status: 'PENDING' },
      });
      if (inFlight > 0) {
        throw new BadRequestException(
          'Já existe um pagamento em andamento para este pedido. Conclua ou cancele o pagamento anterior antes de criar um novo.',
        );
      }

      const amountBrl = Number(order.totalBrl);
      this.validateAmount(amountBrl, orderId);

      const count = await tx.payment.count({ where: { orderId } });
      const attemptNumber = count + 1;
      const mpMethod = method === 'CREDIT_CARD' ? 'card' : method === 'BOLETO' ? 'boleto' : 'pix';
      const idempotencyKey = MercadoPagoClient.deriveIdempotencyKey(
        mpMethod,
        orderId,
        amountBrl,
        attemptNumber,
        extra,
      );
      const payment = await tx.payment.create({
        data: {
          orderId,
          attemptNumber,
          method,
          status: 'PENDING',
          amountBrl: new Decimal(amountBrl.toFixed(2)),
          idempotencyKey,
        },
      });
      return { amountBrl, attemptNumber, idempotencyKey, paymentId: payment.id };
    });
  }

  /** Bind the provider's payment id back to our pre-allocated Payment row. */
  private async finalizeAttempt(paymentId: string, orderId: string, providerPaymentId: string) {
    await this.prisma.$transaction([
      this.prisma.payment.update({
        where: { id: paymentId },
        data: { providerPaymentId },
      }),
      this.prisma.order.update({
        where: { id: orderId },
        data: { paymentId: providerPaymentId },
      }),
    ]);
  }

  /** Roll back a reservation when the provider call fails outright. */
  private async abandonAttempt(paymentId: string, reason: string) {
    await this.prisma.payment.update({
      where: { id: paymentId },
      data: { status: 'FAILED', failureReason: reason.slice(0, 500) },
    });
  }

  private async assertOrderPayable(orderId: string, userId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { buyerId: true, status: true },
    });
    if (!order) throw new NotFoundException('Pedido não encontrado.');
    if (order.buyerId !== userId) {
      throw new ForbiddenException('Acesso negado ao pedido.');
    }
    if (order.status !== 'PENDING') {
      throw new BadRequestException('Pedido já foi pago ou não está pendente.');
    }
  }

  /**
   * Ask Mercado Pago what actually exists for this order.
   *
   * Two-stage on purpose:
   *   1. SEARCH by external_reference — discovery only. The index is
   *      eventually consistent and MP documents no freshness guarantee,
   *      so an empty result is AMBIGUOUS ("not indexed yet"), never
   *      proof that no instrument exists.
   *   2. GET by id — the authority. Every candidate is confirmed
   *      individually; nothing is decided from search output alone.
   *
   * The verdict is deliberately conservative: we mint only when EVERY
   * instrument MP knows about is failure-terminal. Anything live,
   * anything approved, anything unclassified, or any read failure means
   * HOLD. Never mint into ambiguity — that is the double-charge.
   */
  private async reconcileOrder(orderId: string): Promise<ReconcileOutcome> {
    let candidates: Array<{ id: string }>;
    try {
      candidates = await this.mercadoPago.searchPaymentsByExternalReference(orderId);
    } catch (err) {
      return { action: 'hold', reason: `search failed: ${String(err).slice(0, 120)}` };
    }

    if (candidates.length === 0) {
      return { action: 'hold', reason: 'no instrument indexed yet (search is eventually consistent)' };
    }

    let allFailureTerminal = true;
    for (const candidate of candidates) {
      let detail: MpPaymentDetail | null;
      try {
        detail = await this.mercadoPago.getPaymentDetail(candidate.id);
      } catch (err) {
        return {
          action: 'hold',
          reason: `authority read failed for ${candidate.id}: ${String(err).slice(0, 100)}`,
        };
      }
      if (!detail) {
        return { action: 'hold', reason: `no detail returned for ${candidate.id}` };
      }

      // Adopt on the FIRST live or approved instrument — one is enough to
      // prove minting would create a second payable instrument.
      if (MP_LIVE.has(detail.status) || MP_SUCCESS_TERMINAL.has(detail.status)) {
        return { action: 'adopt', detail };
      }
      if (!MP_FAILURE_TERMINAL.has(detail.status)) {
        // A status in neither set: unknown to us, so unsafe to act on.
        allFailureTerminal = false;
      }
    }

    return allFailureTerminal
      ? { action: 'mint' }
      : { action: 'hold', reason: 'provider returned a status outside the known Payments-API sets' };
  }

  /** Bind an instrument MP already holds to the order, minting nothing. */
  private async adoptInstrument(orderId: string, detail: MpPaymentDetail) {
    await this.prisma.$transaction(async (tx) => {
      await tx.order.updateMany({
        where: { id: orderId, paymentId: null },
        data: { paymentId: detail.id },
      });
      // Attach the provider id to the stalled reservation so the
      // reconciliation cron can see it from here on — it only sweeps rows
      // where providerPaymentId is set.
      const stalled = await tx.payment.findFirst({
        where: { orderId, status: 'PENDING', providerPaymentId: null },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      if (stalled) {
        await tx.payment.update({
          where: { id: stalled.id },
          data: { providerPaymentId: detail.id },
        });
      }
    });
    this.logger.warn(
      `Adopted existing MP instrument ${detail.id} (status=${detail.status}) for order ${orderId} — no new payment minted`,
    );
  }

  /**
   * Gate every mint behind reconciliation when a reservation has stalled.
   * Returns the adopted instrument when one already exists, or null when
   * it is provably safe to mint.
   */
  private async reconcileBeforeMint(
    orderId: string,
    userId: string,
  ): Promise<MpPaymentDetail | null> {
    const stallCutoff = new Date(Date.now() - RESERVATION_STALL_MS);
    const stalled = await this.prisma.payment.count({
      where: {
        orderId,
        status: 'PENDING',
        providerPaymentId: null,
        createdAt: { lte: stallCutoff },
      },
    });
    if (stalled === 0) return null;

    await this.assertOrderPayable(orderId, userId);
    const outcome = await this.reconcileOrder(orderId);

    if (outcome.action === 'hold') {
      this.logger.warn(`Reconcile HOLD for order ${orderId}: ${outcome.reason}`);
      throw new ServiceUnavailableException(
        'Não foi possível confirmar o status do pagamento anterior. Tente novamente em instantes.',
      );
    }

    if (outcome.action === 'adopt') {
      await this.adoptInstrument(orderId, outcome.detail);
      return outcome.detail;
    }

    const { count } = await this.prisma.payment.updateMany({
      where: {
        orderId,
        status: 'PENDING',
        providerPaymentId: null,
        createdAt: { lte: stallCutoff },
      },
      data: {
        status: 'FAILED',
        failureReason: 'reconciled: provider holds no live instrument',
      },
    });
    this.logger.log(
      `Reconcile MINT for order ${orderId} — retired ${count} stalled reservation(s)`,
    );
    return null;
  }

  /** Shape an adopted instrument like a freshly created PIX payment. */
  private toPixResponse(orderId: string, detail: MpPaymentDetail) {
    return {
      id: detail.id,
      orderId,
      method: 'pix' as const,
      amountBrl: detail.amountBrl,
      qrCode: detail.qrCode,
      qrCodeBase64: detail.qrCodeBase64,
      pixCopiaECola: detail.qrCode,
      expiresAt: detail.expiresAt,
      status: detail.status,
      adopted: true,
    };
  }

  /**
   * Buyer-facing "generate a new PIX code" after the QR expires.
   *
   * MUST route through reconciliation. A regenerate button that mints
   * directly IS the double-charge: the buyer sees an expired QR, but the
   * instrument may still be live at MP (our clock and MP's cancellation
   * are not the same event), and paying the old code after a new one was
   * minted leaves money against an instrument the order no longer points
   * at.
   */
  async regeneratePixPayment(orderId: string, userId: string) {
    await this.assertOrderPayable(orderId, userId);

    const outcome = await this.reconcileOrder(orderId);

    if (outcome.action === 'hold') {
      this.logger.warn(
        `Regenerate HOLD for order ${orderId}: ${outcome.reason}`,
      );
      throw new ServiceUnavailableException(
        'Não foi possível confirmar o status do pagamento atual. Tente novamente em instantes.',
      );
    }

    if (outcome.action === 'adopt') {
      // Still live (or already paid) at MP — hand back what exists.
      return this.toPixResponse(orderId, outcome.detail);
    }

    // Every instrument is failure-terminal (an expired PIX is
    // status=cancelled / status_detail=expired), so re-pay is safe.
    await this.prisma.$transaction(async (tx) => {
      await tx.order.updateMany({
        where: { id: orderId, status: 'PENDING' },
        data: { paymentId: null },
      });
      await tx.payment.updateMany({
        where: { orderId, status: 'PENDING' },
        data: {
          status: 'FAILED',
          failureReason: 'reconciled: instrument expired or terminally failed',
        },
      });
    });

    return this.createPixPayment(orderId, userId);
  }

  async createPixPayment(orderId: string, userId: string) {
    // Never mint speculatively: if a prior reservation stalled, ask MP
    // what exists first and adopt it rather than creating a second
    // payable instrument.
    const adopted = await this.reconcileBeforeMint(orderId, userId);
    if (adopted) return this.toPixResponse(orderId, adopted);

    const reservation = await this.reserveAttempt(orderId, userId, 'PIX');
    this.logger.log(`Creating PIX payment for order ${orderId} (attempt ${reservation.attemptNumber})`);
    let result;
    try {
      result = await this.mercadoPago.createPixPayment(
        orderId,
        reservation.amountBrl,
        `Vintage.br - Pedido ${orderId}`,
        reservation.attemptNumber,
      );
    } catch (e) {
      await this.abandonAttempt(reservation.paymentId, String(e));
      throw e;
    }
    await this.finalizeAttempt(reservation.paymentId, orderId, String(result.id));
    return result;
  }

  async createCardPayment(
    orderId: string,
    userId: string,
    installments: number,
    cardToken?: string,
  ) {
    const reservation = await this.reserveAttempt(
      orderId,
      userId,
      'CREDIT_CARD',
      `${installments}:${cardToken ?? ''}`,
    );
    this.logger.log(`Creating card payment for order ${orderId} (attempt ${reservation.attemptNumber})`);
    let result;
    try {
      result = await this.mercadoPago.createCardPayment(
        orderId,
        reservation.amountBrl,
        installments,
        cardToken ?? '',
        reservation.attemptNumber,
      );
    } catch (e) {
      await this.abandonAttempt(reservation.paymentId, String(e));
      throw e;
    }
    await this.finalizeAttempt(reservation.paymentId, orderId, String(result.id));
    return result;
  }

  async createBoletoPayment(orderId: string, userId: string) {
    const reservation = await this.reserveAttempt(orderId, userId, 'BOLETO');
    this.logger.log(`Creating boleto payment for order ${orderId} (attempt ${reservation.attemptNumber})`);
    let result;
    try {
      result = await this.mercadoPago.createBoletoPayment(
        orderId,
        reservation.amountBrl,
        `Vintage.br - Pedido ${orderId}`,
        reservation.attemptNumber,
      );
    } catch (e) {
      await this.abandonAttempt(reservation.paymentId, String(e));
      throw e;
    }
    await this.finalizeAttempt(reservation.paymentId, orderId, String(result.id));
    return result;
  }

  /**
   * Retry payment for a PENDING order whose previous attempt failed /
   * expired. Clears the order's active paymentId, marks the previous
   * Payment row as FAILED (so status math is accurate), and delegates
   * to the requested method's create helper. The create helper's
   * `nextAttemptNumber` call will see the existing rows and assign
   * attemptNumber = prev+1.
   *
   * Caps at MAX_PAYMENT_ATTEMPTS. Beyond the cap, the retry refuses
   * and transitions the order to CANCELLED so the listing can be
   * re-listed.
   *
   * Tenant-isolated: getAndValidateOrder-style ownership check but
   * relaxed on the `paymentId !== null` guard — retry EXPECTS an
   * active paymentId from the prior attempt.
   */
  async retryPayment(orderId: string, userId: string, dto: RetryPaymentDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { payments: { orderBy: { attemptNumber: 'desc' }, take: 1 } },
    });
    if (!order) {
      throw new NotFoundException('Pedido não encontrado.');
    }
    if (order.buyerId !== userId) {
      throw new ForbiddenException('Acesso negado ao pedido.');
    }
    if (order.status !== 'PENDING') {
      throw new BadRequestException(
        'Somente pedidos aguardando pagamento podem ser retentados.',
      );
    }

    // PAYMENT_FAILURE_VELOCITY — flag or block on repeated failures.
    // Runs via FraudService so thresholds stay DB-tunable without a
    // deploy. Injected lazily to avoid a circular module import.
    if (this.fraud) {
      const decision = await this.fraud.evaluatePaymentAttempt(userId);
      if (decision.action === 'BLOCK') {
        throw new ForbiddenException(
          'Muitas tentativas de pagamento falharam recentemente. Aguarde alguns minutos antes de tentar novamente.',
        );
      }
    }

    const attemptsSoFar = await this.prisma.payment.count({ where: { orderId } });
    if (attemptsSoFar >= MAX_PAYMENT_ATTEMPTS) {
      // Auto-cancel the order and free the listing so the buyer can
      // start fresh if they still want the item.
      this.logger.warn(
        `Order ${orderId} hit MAX_PAYMENT_ATTEMPTS (${MAX_PAYMENT_ATTEMPTS}); auto-cancelling.`,
      );
      await this.prisma.$transaction(async (tx) => {
        // Only claim the listing-reactivation if the order actually
        // moves from PENDING → CANCELLED. If a concurrent retry or
        // webhook already PAID the order between our attempt-count
        // check and this tx, we must NOT reactivate the listing
        // (that would resurrect a sold item).
        const claim = await tx.order.updateMany({
          where: { id: orderId, status: 'PENDING' },
          data: { status: 'CANCELLED', paymentId: null },
        });
        if (claim.count === 0) return;
        await tx.listing.update({
          where: { id: order.listingId },
          data: { status: 'ACTIVE' },
        });
        await tx.orderListingSnapshot.deleteMany({ where: { orderId } });
      });
      throw new BadRequestException(
        `Número máximo de tentativas de pagamento (${MAX_PAYMENT_ATTEMPTS}) atingido. Pedido cancelado.`,
      );
    }

    // Mark the most-recent Payment row as FAILED so webhook + ledger
    // state stays consistent. Idempotent — updateMany gated on
    // status='PENDING' means a concurrent retry (or webhook landing
    // mid-retry) that already moved this row to FAILED/SUCCEEDED
    // returns count=0 and we leave it alone. Plain update() raced
    // the webhook and used to overwrite SUCCEEDED with FAILED.
    const lastAttempt = order.payments[0];
    if (lastAttempt && lastAttempt.status === 'PENDING') {
      await this.prisma.payment.updateMany({
        where: { id: lastAttempt.id, status: 'PENDING' },
        data: { status: 'FAILED', failureReason: 'Buyer retried payment' },
      });
    }

    // Atomic paymentId claim: two concurrent retryPayment calls for
    // the same order used to both clear paymentId (both pass the
    // outer `order.paymentId === prevPaymentId` read) and both
    // invoke the MP create helper → duplicate MP charge. updateMany
    // gated on the exact paymentId we saw rejects the loser.
    const claim = await this.prisma.order.updateMany({
      where: { id: orderId, paymentId: order.paymentId ?? null },
      data: { paymentId: null },
    });
    if (claim.count === 0) {
      throw new ConflictException(
        'Outro retry de pagamento já está em andamento para este pedido.',
      );
    }

    // Delegate to the right create helper based on requested method.
    if (dto.method === RetryPaymentMethod.PIX) {
      return this.createPixPayment(orderId, userId);
    }
    if (dto.method === RetryPaymentMethod.CREDIT_CARD) {
      if (!dto.installments) {
        throw new BadRequestException('installments é obrigatório para CREDIT_CARD.');
      }
      return this.createCardPayment(orderId, userId, dto.installments, dto.cardToken);
    }
    return this.createBoletoPayment(orderId, userId);
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
      this.metrics.webhookSignatureRejected.inc({ provider: 'mercadopago' });
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
      this.metrics.webhookDuplicate.inc({ provider: 'mercadopago' });
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
        this.metrics.paymentFlagCreated.inc({ reason: 'amount_mismatch' });
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
              .catch(warnAndSwallow(this.logger, 'payments.admin-flag-notify'));
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

        // Conditional flip: only PENDING→PAID. A concurrent settlement —
        // a duplicate webhook delivery with a different delivery id, or
        // the reconciliation poller (processApprovedPayment reused with a
        // `poller:` delivery id) — may have flipped this order out of
        // PENDING between the findFirst above and this write. count===0
        // means we lost that race; throw the duplicate sentinel to roll
        // the whole transaction back (our ProcessedWebhook insert AND the
        // wallet credit below) so escrow is never opened twice.
        const flipped = await tx.order.updateMany({
          where: { id: order.id, status: 'PENDING' },
          data: { status: 'PAID' },
        });
        if (flipped.count === 0) {
          throw new DuplicateWebhookSignal(deliveryId);
        }

        // Mark the matching Payment row SUCCEEDED. We resolve by
        // providerPaymentId rather than by attemptNumber so the mark
        // works even when the row was written by an older code path
        // (legacy orders pre-Payment-model have no row and the
        // updateMany is a silent no-op).
        await tx.payment.updateMany({
          where: { orderId: order.id, providerPaymentId: paymentId },
          data: { status: 'SUCCEEDED' },
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
    // Buyers AND sellers may read payment status for their own orders. The
    // buyer needs it to confirm receipt-of-payment; the seller needs it to
    // verify the funds before shipping. Returning 404 on "exists but you don't
    // own it" keeps the endpoint from doubling as an ownership oracle.
    const order = await this.prisma.order.findFirst({
      where: { paymentId, OR: [{ buyerId: userId }, { sellerId: userId }] },
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

  /**
   * Reconciliation entry point for the lost-webhook poller
   * (PaymentsReconciliationCron). Fetches the live Mercado Pago status
   * for a provider payment id and, when approved, runs the EXACT same
   * settlement path a `payment.updated` webhook would — reusing the
   * transactional ProcessedWebhook dedup and the conditional PENDING→PAID
   * flip so a delayed webhook and the poller can never double-settle.
   *
   * Returns the resolved disposition so the cron can flip the Payment row
   * for terminal failures ('failed') while leaving still-in-flight
   * payments ('pending') for a later tick.
   */
  async reconcilePayment(
    paymentId: string,
  ): Promise<'approved' | 'failed' | 'pending'> {
    const status = await this.mercadoPago.getPaymentStatus(paymentId);

    if (status.status === 'approved') {
      // `poller:<id>` is a deterministic delivery id: a second poll of the
      // same payment hits P2002 on the ProcessedWebhook insert (swallowed
      // as a duplicate), and a real webhook keeps its own delivery id, so
      // whichever settles first wins the conditional order flip.
      await this.processApprovedPayment(
        `poller:${paymentId}`,
        'reconcile',
        paymentId,
        status,
      );
      return 'approved';
    }

    if (TERMINAL_FAILURE_STATUSES.has(status.status)) {
      return 'failed';
    }

    return 'pending';
  }
}
