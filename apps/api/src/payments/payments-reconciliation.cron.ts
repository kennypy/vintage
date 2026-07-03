import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { CronLockService } from '../common/services/cron-lock.service';
import { PaymentsService } from './payments.service';

/**
 * Recovers payments whose Mercado Pago `payment.updated` webhook never
 * arrived — a dropped delivery, our endpoint down during MP's retry
 * window, or an MP outage. Without this, an approved PIX payment can
 * leave its order stuck PENDING forever: the buyer paid, the seller
 * never sees the sale, and the listing stays locked.
 *
 * Every 5 minutes we sweep Payment rows still PENDING for longer than
 * RECONCILE_MIN_AGE_MS (long enough that the webhook *should* have
 * landed) that carry a providerPaymentId, and ask MP for the live
 * status. Approved payments run the exact settlement path the webhook
 * uses — guarded by the same ProcessedWebhook dedup and the conditional
 * PENDING→PAID flip, so the poller and a late webhook can never
 * double-open escrow. Terminally-failed payments are marked FAILED.
 */
@Injectable()
export class PaymentsReconciliationCron {
  private readonly logger = new Logger(PaymentsReconciliationCron.name);

  /**
   * Grace period before a PENDING payment is considered "lost". MP's own
   * webhook retries span a few minutes; 15 min clears that window so we
   * don't race a webhook that is merely slow.
   */
  private static readonly RECONCILE_MIN_AGE_MS = 15 * 60 * 1000;

  /** Bound each tick so a backlog can't stampede MP's rate limit. */
  private static readonly BATCH = 200;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cronLock: CronLockService,
    private readonly payments: PaymentsService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async reconcilePendingPayments(): Promise<void> {
    if (!(await this.cronLock.acquire('payments:reconcile'))) return;

    const cutoff = new Date(
      Date.now() - PaymentsReconciliationCron.RECONCILE_MIN_AGE_MS,
    );

    const stale = await this.prisma.payment.findMany({
      where: {
        status: 'PENDING',
        providerPaymentId: { not: null },
        createdAt: { lt: cutoff },
      },
      select: { id: true, providerPaymentId: true },
      orderBy: { createdAt: 'asc' },
      take: PaymentsReconciliationCron.BATCH,
    });

    if (stale.length === 0) return;

    this.logger.log(
      `Reconciling ${stale.length} PENDING payment(s) with no confirmation webhook`,
    );

    for (const payment of stale) {
      const providerPaymentId = payment.providerPaymentId;
      // `providerPaymentId: { not: null }` guarantees this, but narrow for TS.
      if (!providerPaymentId) continue;

      try {
        const outcome = await this.payments.reconcilePayment(providerPaymentId);

        if (outcome === 'approved') {
          this.logger.log(
            `Payment ${payment.id} (${providerPaymentId}) settled via reconciliation — webhook was lost`,
          );
        } else if (outcome === 'failed') {
          // Conditional flip: only touch rows still PENDING so we never
          // clobber a status the settlement path just advanced.
          await this.prisma.payment.updateMany({
            where: { id: payment.id, status: 'PENDING' },
            data: {
              status: 'FAILED',
              failureReason:
                'reconciled: provider reported terminal failure',
            },
          });
          this.logger.log(
            `Payment ${payment.id} (${providerPaymentId}) marked FAILED via reconciliation`,
          );
        }
        // 'pending' → still in flight; leave it for a later tick.
      } catch (err) {
        this.logger.error(
          `Reconciliation failed for payment ${payment.id} (${providerPaymentId}): ${String(err).slice(0, 200)}`,
        );
      }
    }
  }
}
