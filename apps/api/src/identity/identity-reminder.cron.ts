import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CronLockService } from '../common/services/cron-lock.service';

/**
 * Nudges users who registered but never completed CPF identity
 * verification. Sends a bell notification (which the push layer may
 * also relay to mobile) at each cadence step after signup.
 *
 * Cadence is env-tunable via IDENTITY_REMINDER_CADENCE_HOURS, a
 * comma-separated list of hours-past-signup. Default: "24,72,168" —
 * day 1, day 3, day 7. A user who fires all three without verifying is
 * dropped from the cadence; ops can resume by setting
 * `notification.data.identityReminderStep` back to 0 via SQL.
 *
 * We dedup on (userId, identityReminderStep) so the cron can run every
 * hour without re-nudging users whose step already fired but whose
 * signup timestamp falls between two steps.
 */
@Injectable()
export class IdentityReminderCron {
  private readonly logger = new Logger(IdentityReminderCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly cronLock: CronLockService,
    private readonly config: ConfigService,
  ) {}

  private getCadenceHours(): number[] {
    const raw = this.config.get<string>('IDENTITY_REMINDER_CADENCE_HOURS', '24,72,168');
    return raw
      .split(',')
      .map((h) => Number(h.trim()))
      .filter((n) => Number.isFinite(n) && n > 0)
      .sort((a, b) => a - b);
  }

  @Cron(CronExpression.EVERY_HOUR)
  async run() {
    if (!(await this.cronLock.acquire('identity:reminder'))) return;

    const cadence = this.getCadenceHours();
    if (cadence.length === 0) return;

    // Only enforce when the feature is switched on — otherwise users
    // see the nudge but clicking through goes to a dead flag-gated
    // endpoint. Ops can flip this to true the moment the Serpro
    // contract is live.
    const enabled = this.config.get<string>('IDENTITY_VERIFICATION_ENABLED') === 'true';
    if (!enabled) return;

    const now = Date.now();
    const maxWindowMs = cadence[cadence.length - 1] * 60 * 60 * 1000 + 60 * 60 * 1000;
    const since = new Date(now - maxWindowMs);

    const candidates = await this.prisma.user.findMany({
      where: {
        cpfIdentityVerified: false,
        deletedAt: null,
        isBanned: false,
        createdAt: { gte: since },
        // Don't nudge users who haven't even verified email — they'll
        // hit a different (earlier) prompt first.
        emailVerifiedAt: { not: null },
      },
      select: { id: true, name: true, createdAt: true },
      take: 500,
    });

    if (candidates.length === 0) return;

    let sent = 0;
    for (const u of candidates) {
      const hoursSinceSignup = (now - u.createdAt.getTime()) / (60 * 60 * 1000);
      const eligibleStep = cadence.findIndex(
        (cutoffHours, idx) =>
          hoursSinceSignup >= cutoffHours &&
          (idx === cadence.length - 1 || hoursSinceSignup < cadence[idx + 1]),
      );
      if (eligibleStep === -1) continue;

      // Dedup: don't resend the same step. We look for any prior
      // identity-reminder notification carrying this step value.
      const already = await this.prisma.notification.findFirst({
        where: {
          userId: u.id,
          type: 'identity_reminder',
          data: { path: ['step'], equals: eligibleStep },
        },
        select: { id: true },
      });
      if (already) continue;

      try {
        await this.notifications.createNotification(
          u.id,
          'identity_reminder',
          'Verifique sua identidade',
          'Conclua a verificação de CPF para ganhar o selo "CPF Verificado" e começar a vender no Vintage.br.',
          { step: eligibleStep, deepLink: '/conta/verificacao' },
          'news',
        );
        sent += 1;
      } catch (err) {
        this.logger.warn(
          `Identity reminder failed for user ${u.id}: ${String(err).slice(0, 200)}`,
        );
      }
    }

    if (sent > 0) {
      this.logger.log(`Identity reminder cron sent ${sent} nudges`);
    }
  }
}
