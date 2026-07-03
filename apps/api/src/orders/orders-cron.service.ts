import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Decimal } from '@prisma/client/runtime/client';
import { PrismaService } from '../prisma/prisma.service';
import { OrdersService } from './orders.service';
import { ListingsService } from '../listings/listings.service';
import { CronLockService } from '../common/services/cron-lock.service';
import { SHIPPING_DEADLINE_DAYS, RETURN_INSPECTION_DAYS } from '@vintage/shared';
import { warnAndSwallow } from '../common/utils/fire-and-forget';

/**
 * Thrown inside the auto-cancel $transaction when the conditional
 * status flip finds the order has moved on (seller shipped, another
 * instance already cancelled). Rolls the whole side-effect batch back
 * — the outer catch swallows it silently because it's a routine race,
 * not an error. Anything else surfaces normally.
 */
class OrderStateRaceSignal extends Error {
  constructor(public readonly orderId: string) {
    super(`order state changed during auto-cancel: ${orderId}`);
    this.name = 'OrderStateRaceSignal';
  }
}

/**
 * A PENDING order older than this whose payment never completed (the buyer
 * abandoned checkout, or every attempt failed) is dead. Order creation
 * marks the listing SOLD, so without this sweep the listing stays locked
 * forever. No money changed hands, so there is nothing to refund — we just
 * cancel and free the listing.
 */
const PENDING_PAYMENT_TIMEOUT_HOURS = 24;

@Injectable()
export class OrdersCronService {
  private readonly logger = new Logger(OrdersCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersService: OrdersService,
    private readonly cronLock: CronLockService,
    private readonly listings: ListingsService,
  ) {}

  /**
   * Auto-confirm delivered orders whose dispute window has expired.
   * Releases escrowed funds to the seller.
   * Runs every hour.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async autoConfirmOrders() {
    if (!(await this.cronLock.acquire('orders:autoConfirm'))) return;

    const now = new Date();

    const expiredOrders = await this.prisma.order.findMany({
      where: {
        status: 'DELIVERED',
        disputeDeadline: { lt: now },
      },
      select: { id: true },
    });

    if (expiredOrders.length === 0) return;

    this.logger.log(
      `Auto-confirming ${expiredOrders.length} orders past dispute deadline`,
    );

    for (const order of expiredOrders) {
      try {
        await this.ordersService.enterHold(order.id);
        this.logger.log(`Auto-confirmed order ${order.id} — entering escrow hold`);
      } catch (err) {
        this.logger.error(
          `Failed to auto-confirm order ${order.id}: ${String(err).slice(0, 200)}`,
        );
      }
    }
  }

  /**
   * Release escrow on HELD orders whose hold window has elapsed.
   * Skips any order that has an OPEN dispute or an active (non-terminal)
   * return — those paths will settle the money themselves.
   * Runs every hour.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async releaseHeldEscrow() {
    if (!(await this.cronLock.acquire('orders:releaseHeld'))) return;

    const now = new Date();

    const ready = await this.prisma.order.findMany({
      where: {
        status: 'HELD',
        escrowReleasesAt: { lte: now },
        dispute: { is: null },
        returnRequest: { is: null },
      },
      select: { id: true },
    });

    if (ready.length === 0) return;

    this.logger.log(`Releasing escrow hold for ${ready.length} orders`);

    for (const order of ready) {
      try {
        await this.ordersService.finalizeEscrow(order.id);
        this.logger.log(`Released escrow for order ${order.id}`);
      } catch (err) {
        this.logger.error(
          `Failed to release escrow for order ${order.id}: ${String(err).slice(0, 200)}`,
        );
      }
    }
  }

  /**
   * Auto-cancel PAID orders where the seller has not shipped within
   * the shipping deadline. Reverses the escrow hold and refunds the buyer.
   * Runs every hour.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async autoCancelUnshippedOrders() {
    if (!(await this.cronLock.acquire('orders:autoCancelUnshipped'))) return;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - SHIPPING_DEADLINE_DAYS);

    const staleOrders = await this.prisma.order.findMany({
      where: {
        status: 'PAID',
        createdAt: { lt: cutoff },
        shippedAt: null,
      },
      include: { listing: { select: { id: true, title: true } } },
    });

    if (staleOrders.length === 0) return;

    this.logger.log(
      `Auto-cancelling ${staleOrders.length} unshipped orders past ${SHIPPING_DEADLINE_DAYS}-day deadline`,
    );

    for (const order of staleOrders) {
      try {
        const itemAmount = Number(order.itemPriceBrl);
        const refundAmount = Number(order.totalBrl);

        await this.prisma.$transaction(async (tx) => {
          // Conditional cancel: only flip PAID→CANCELLED. updateMany
          // returns the affected-row count; zero means the order left
          // PAID between the findMany() above and this write (the
          // seller shipped in that window, or another cron instance
          // beat us to it because the distributed lock fell through
          // to its single-instance fallback). In either case, the
          // rest of the transaction — wallet reversal, refund,
          // listing reactivation, snapshot purge — must NOT fire, or
          // we'd double-refund or resurrect a sold listing. Throwing
          // the sentinel rolls the transaction back to a clean no-op
          // and the outer catch swallows it silently.
          const res = await tx.order.updateMany({
            where: { id: order.id, status: 'PAID', shippedAt: null },
            data: { status: 'CANCELLED' },
          });
          if (res.count === 0) {
            throw new OrderStateRaceSignal(order.id);
          }

          // Reverse escrow hold on seller's wallet
          const sellerWallet = await tx.wallet.findUnique({
            where: { userId: order.sellerId },
          });

          if (sellerWallet) {
            await tx.wallet.update({
              where: { id: sellerWallet.id },
              data: { pendingBrl: { decrement: itemAmount } },
            });

            await tx.walletTransaction.create({
              data: {
                walletId: sellerWallet.id,
                type: 'ESCROW_RELEASE',
                amountBrl: new Decimal((-itemAmount).toFixed(2)),
                referenceId: order.id,
                description: `Custódia revertida (não enviado): ${order.listing.title}`,
              },
            });
          }

          // Refund buyer (store credit)
          const buyerWallet = await tx.wallet.upsert({
            where: { userId: order.buyerId },
            create: { userId: order.buyerId, balanceBrl: 0, pendingBrl: 0 },
            update: {},
          });

          await tx.wallet.update({
            where: { id: buyerWallet.id },
            data: { balanceBrl: { increment: refundAmount } },
          });

          await tx.walletTransaction.create({
            data: {
              walletId: buyerWallet.id,
              type: 'REFUND',
              amountBrl: new Decimal(refundAmount.toFixed(2)),
              referenceId: order.id,
              description: `Reembolso (vendedor não enviou): ${order.listing.title}`,
            },
          });

          // Re-activate the listing so it can be sold again
          await tx.listing.update({
            where: { id: order.listingId },
            data: { status: 'ACTIVE' },
          });

          // Seller never shipped → order CANCELLED → no dispute
          // window ever opened. Purge the snapshot.
          await tx.orderListingSnapshot.deleteMany({
            where: { orderId: order.id },
          });
        });

        // Listing is ACTIVE again — re-add it to search.
        this.listings.syncSearchIndex(order.listingId).catch(
          warnAndSwallow(this.logger, 'orders-cron.search-sync'),
        );

        this.logger.log(`Auto-cancelled order ${order.id} — buyer refunded R$${refundAmount.toFixed(2)}`);
      } catch (err) {
        if (err instanceof OrderStateRaceSignal) {
          // Expected race — seller shipped or another instance
          // already cancelled between findMany and the conditional
          // update. Log at debug so a noisy DB doesn't spam ops.
          this.logger.debug(
            `auto-cancel skipped — order ${err.orderId} state changed under us`,
          );
          continue;
        }
        this.logger.error(
          `Failed to auto-cancel order ${order.id}: ${String(err).slice(0, 200)}`,
        );
      }
    }
  }

  /**
   * Auto-cancel orders stuck in PENDING past PENDING_PAYMENT_TIMEOUT_HOURS
   * whose payment never completed. We skip any order that still has an
   * in-flight (PENDING) or SUCCEEDED payment — the reconciliation poller
   * owns those, and cancelling would strand a payment that is about to (or
   * did) go through. A truly dead PENDING order otherwise pins its listing
   * as SOLD forever; here we cancel it and release the listing. No money
   * was captured, so there is nothing to refund.
   * Runs every hour.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async cancelStalePendingOrders() {
    if (!(await this.cronLock.acquire('orders:cancelStalePending'))) return;

    const cutoff = new Date(
      Date.now() - PENDING_PAYMENT_TIMEOUT_HOURS * 60 * 60 * 1000,
    );

    const dead = await this.prisma.order.findMany({
      where: {
        status: 'PENDING',
        createdAt: { lt: cutoff },
        payments: { none: { status: { in: ['PENDING', 'SUCCEEDED'] } } },
      },
      select: { id: true, listingId: true },
    });

    if (dead.length === 0) return;

    this.logger.log(
      `Cancelling ${dead.length} stale PENDING order(s) past ${PENDING_PAYMENT_TIMEOUT_HOURS}h with no completed payment`,
    );

    for (const order of dead) {
      try {
        await this.prisma.$transaction(async (tx) => {
          // Conditional cancel: only PENDING→CANCELLED. count===0 means the
          // order advanced (a late webhook or the reconciliation poller
          // settled it to PAID, or another instance cancelled it) between
          // the findMany above and this write. Rolling back keeps us from
          // reactivating a listing that just sold.
          const res = await tx.order.updateMany({
            where: { id: order.id, status: 'PENDING' },
            data: { status: 'CANCELLED' },
          });
          if (res.count === 0) {
            throw new OrderStateRaceSignal(order.id);
          }

          // Order creation marked the listing SOLD — release it so it can
          // be sold again.
          await tx.listing.update({
            where: { id: order.listingId },
            data: { status: 'ACTIVE' },
          });

          // Order never reached PAID → no dispute window ever opened.
          // Purge the snapshot if one exists.
          await tx.orderListingSnapshot.deleteMany({
            where: { orderId: order.id },
          });
        });

        // Listing is ACTIVE again — re-add it to search.
        this.listings.syncSearchIndex(order.listingId).catch(
          warnAndSwallow(this.logger, 'orders-cron.search-sync'),
        );

        this.logger.log(
          `Cancelled stale PENDING order ${order.id} — listing ${order.listingId} reactivated`,
        );
      } catch (err) {
        if (err instanceof OrderStateRaceSignal) {
          this.logger.debug(
            `stale-pending cancel skipped — order ${err.orderId} state changed under us`,
          );
          continue;
        }
        this.logger.error(
          `Failed to cancel stale PENDING order ${order.id}: ${String(err).slice(0, 200)}`,
        );
      }
    }
  }

  /**
   * Auto-escalate RECEIVED returns that the seller hasn't inspected
   * within RETURN_INSPECTION_DAYS. Creates a Dispute so ops can
   * mediate — the buyer isn't stuck waiting for seller action.
   * Runs every hour.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async escalateStaleReturns() {
    if (!(await this.cronLock.acquire('returns:escalateStale'))) return;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - RETURN_INSPECTION_DAYS);

    const stale = await this.prisma.orderReturn.findMany({
      where: {
        status: 'RECEIVED',
        receivedAt: { lt: cutoff },
      },
      include: { order: { select: { id: true } } },
    });

    if (stale.length === 0) return;

    this.logger.log(
      `Escalating ${stale.length} stale returns past ${RETURN_INSPECTION_DAYS}-day inspection window`,
    );

    for (const ret of stale) {
      try {
        await this.prisma.$transaction(async (tx) => {
          // Conditional claim: only escalate a return that is STILL 'RECEIVED'.
          // The unconditional update used to stamp 'DISPUTED' even over a
          // return that inspectApprove had concurrently moved to 'REFUNDED',
          // then create a fresh OPEN dispute on an already-refunded order —
          // a second refund waiting to happen. count===0 means another action
          // already advanced the return; skip it.
          const claim = await tx.orderReturn.updateMany({
            where: { id: ret.id, status: 'RECEIVED' },
            data: { status: 'DISPUTED' },
          });
          if (claim.count === 0) {
            return;
          }
          const existing = await tx.dispute.findUnique({
            where: { orderId: ret.order.id },
          });
          if (!existing) {
            await tx.dispute.create({
              data: {
                orderId: ret.order.id,
                openedById: ret.requestedById,
                reason: ret.reason,
                description: `Devolução recebida sem inspeção do vendedor dentro do prazo. Descrição original: ${ret.description}`,
                status: 'OPEN',
              },
            });
            await tx.order.update({
              where: { id: ret.order.id },
              data: { status: 'DISPUTED' },
            });
          }
        });
      } catch (err) {
        this.logger.error(
          `Failed to escalate stale return ${ret.id}: ${String(err).slice(0, 200)}`,
        );
      }
    }
  }
}
