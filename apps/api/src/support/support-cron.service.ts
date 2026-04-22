import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { CronLockService } from '../common/services/cron-lock.service';
import { SupportService } from './support.service';

/**
 * Reconcile loop for tickets that never got an `externalTicketId`
 * acknowledgement from the CRM — usually because the webhook 5xx'd,
 * timed out, or ran while the CRM was down.
 *
 * Runs hourly. Retries `ticket.opened` emission for every ticket whose
 * externalTicketId is still null and which is younger than 7 days (older
 * ones are effectively dead letters — surface those through the
 * AuditLog `CRM_WEBHOOK_FAILED` rows for manual triage).
 *
 * Fires one event per call, serially, with a small per-run cap so a
 * long backlog can't block other crons. The emission itself already
 * has a 5s timeout + self-logs failures, so the worst case is we
 * retry the same ticket next hour.
 */
@Injectable()
export class SupportCronService {
  private readonly logger = new Logger(SupportCronService.name);

  /** Max tickets reconciled per run so we don't starve the cron queue. */
  private static readonly BATCH_LIMIT = 50;

  /** Stop trying after 7 days — older rows are dead letters. */
  private static readonly MAX_AGE_DAYS = 7;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cronLock: CronLockService,
    private readonly support: SupportService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async reconcileCrmOpens(): Promise<void> {
    if (!(await this.cronLock.acquire('support:reconcileCrmOpens'))) return;

    const url = process.env.SUPPORT_CRM_WEBHOOK_URL ?? '';
    if (!url) return; // CRM integration disabled — nothing to do.

    const cutoff = new Date(
      Date.now() - SupportCronService.MAX_AGE_DAYS * 24 * 60 * 60 * 1000,
    );

    const stuck = await this.prisma.supportTicket.findMany({
      where: {
        externalTicketId: null,
        createdAt: { gte: cutoff },
      },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
      take: SupportCronService.BATCH_LIMIT,
    });

    if (stuck.length === 0) return;

    this.logger.log(`Reconciling ${stuck.length} CRM open(s)…`);

    let delivered = 0;
    for (const t of stuck) {
      try {
        await this.support.emitCrmEvent('ticket.opened', t.id);
        // emitCrmEvent sets externalTicketId on success; we re-read to
        // decide whether this run delivered it. Keeps the loop honest
        // without threading a return value through emitCrmEvent.
        const after = await this.prisma.supportTicket.findUnique({
          where: { id: t.id },
          select: { externalTicketId: true },
        });
        if (after?.externalTicketId) delivered += 1;
      } catch (err) {
        this.logger.warn(
          `Reconcile failed for ticket ${t.id}: ${String(err).slice(0, 160)}`,
        );
      }
    }

    if (delivered > 0) {
      this.logger.log(
        `Reconcile cron delivered ${delivered} of ${stuck.length} stuck CRM open(s).`,
      );
    }
  }
}
