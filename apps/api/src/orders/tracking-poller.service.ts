import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { ShippingService, TrackingEvent } from '../shipping/shipping.service';
import { CronLockService } from '../common/services/cron-lock.service';
import { OrdersService } from './orders.service';
import { ReturnsService } from '../returns/returns.service';

/**
 * Carrier-agnostic "was this event a delivery confirmation?" check.
 *
 * Each Brazilian carrier returns its own status vocabulary:
 *   - Correios SRO:  event type `BDE` (= "Baixa de Distribuição"),
 *                    often rendered as "Objeto entregue ao destinatário"
 *   - Jadlog:        status `ENTREGUE`
 *   - Kangu / Pegaki: status `ENTREGUE` / description containing "entregue"
 *
 * Rather than maintaining per-carrier enums, we pattern-match against
 * the three tokens that actually identify a delivery across all
 * carriers we integrate with. Kept as module-scope so it's trivially
 * unit-testable and reusable from the cron.
 */
export function isDeliveredEvent(event: TrackingEvent): boolean {
  const haystack = `${event.status} ${event.description}`.toUpperCase();
  // \b doesn't cross the accent in ENTREGUE reliably in JS, so use a
  // broad substring match — false positives on words like "NÃO ENTREGUE"
  // are handled by the explicit negation check below.
  if (/NAO ENTREGUE|NÃO ENTREGUE|FALHA/.test(haystack)) return false;
  return /DELIVERED|ENTREGUE|\bBDE\b/.test(haystack);
}

@Injectable()
export class TrackingPollerService {
  private readonly logger = new Logger(TrackingPollerService.name);

  /** How far back to look for SHIPPED orders. Anything older was
   *  probably lost / cancelled-in-carrier and shouldn't consume API
   *  quota on repeated polls. */
  private readonly lookbackDays: number;

  /** Hard cap on rows polled per tick. Correios SRO has strict per-
   *  minute limits; 200/hour is comfortably under any reasonable
   *  plan and gives us a 4800 req/day budget. */
  private readonly batchSize: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly shipping: ShippingService,
    private readonly cronLock: CronLockService,
    private readonly returns: ReturnsService,
    config: ConfigService,
  ) {
    this.lookbackDays = config.get<number>('TRACKING_POLL_LOOKBACK_DAYS', 30);
    this.batchSize = config.get<number>('TRACKING_POLL_BATCH_SIZE', 200);
  }

  /**
   * Polls each SHIPPED order's tracking code against the carrier
   * API and flips to DELIVERED (via OrdersService.markDelivered)
   * when the carrier confirms delivery. markDelivered sets
   * `disputeDeadline = now + DISPUTE_WINDOW_DAYS` — that's when
   * the buyer's dispute window begins, regardless of how long
   * transit took.
   *
   * Hourly cadence: Correios SRO typically updates every 2–4
   * hours, so anything faster is wasted quota. Cron-lock keyed
   * so multi-replica API hosts don't duplicate work.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async pollInFlightShipments() {
    if (!(await this.cronLock.acquire('tracking:poll'))) return;

    const cutoff = new Date(
      Date.now() - this.lookbackDays * 24 * 60 * 60 * 1000,
    );

    const pending = await this.prisma.order.findMany({
      where: {
        status: 'SHIPPED',
        trackingCode: { not: null },
        shippedAt: { gte: cutoff },
      },
      select: { id: true, trackingCode: true, carrier: true },
      orderBy: { shippedAt: 'asc' }, // FIFO — oldest shipments first
      take: this.batchSize,
    });

    if (pending.length === 0) return;

    this.logger.log(
      `Polling ${pending.length} SHIPPED orders for delivery status`,
    );

    let flipped = 0;

    for (const order of pending) {
      try {
        const events = await this.shipping.getTrackingStatus(
          order.trackingCode!,
        );
        const delivered = events.some(isDeliveredEvent);
        if (!delivered) continue;

        // Re-reads status inside a tx to guard against a concurrent
        // buyer-initiated markDelivered — throws BadRequestException
        // if another path already moved it past SHIPPED, which we
        // catch and log without counting as an error. System path —
        // userId null so the buyer-or-seller gate is skipped (the
        // carrier event itself is the authority here).
        await this.orders.markDeliveredInternal(order.id, null);
        flipped += 1;
        this.logger.log(
          `Order ${order.id} auto-marked DELIVERED from carrier event (${order.carrier ?? 'unknown'} / ${order.trackingCode})`,
        );
      } catch (err) {
        this.logger.warn(
          `Tracking poll failed for order ${order.id}: ${String(err).slice(0, 200)}`,
        );
      }
    }

    if (flipped > 0) {
      this.logger.log(
        `Tracking poll tick: ${flipped}/${pending.length} orders flipped to DELIVERED`,
      );
    }

    await this.pollReturns();
  }

  /**
   * Same logic as pollInFlightShipments but for return shipments
   * (buyer → seller). When the carrier reports the return package
   * delivered we transition OrderReturn.SHIPPED → RECEIVED and
   * notify the seller to inspect. Runs as part of the same hourly
   * tick so it inherits the cron lock.
   */
  private async pollReturns() {
    const cutoff = new Date(
      Date.now() - this.lookbackDays * 24 * 60 * 60 * 1000,
    );

    const pendingReturns = await this.prisma.orderReturn.findMany({
      where: {
        status: 'SHIPPED',
        returnTrackingCode: { not: null },
        shippedAt: { gte: cutoff },
      },
      select: { id: true, returnTrackingCode: true },
      orderBy: { shippedAt: 'asc' },
      take: this.batchSize,
    });

    if (pendingReturns.length === 0) return;

    for (const ret of pendingReturns) {
      try {
        const events = await this.shipping.getTrackingStatus(
          ret.returnTrackingCode!,
        );
        if (!events.some(isDeliveredEvent)) continue;
        await this.returns.markReceivedByTracking(ret.id);
        this.logger.log(
          `Return ${ret.id} auto-marked RECEIVED from carrier event (${ret.returnTrackingCode})`,
        );
      } catch (err) {
        this.logger.warn(
          `Return tracking poll failed for ${ret.id}: ${String(err).slice(0, 200)}`,
        );
      }
    }
  }
}
