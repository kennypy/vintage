import { Logger } from '@nestjs/common';

/**
 * Reusable rejection handler for fire-and-forget side effects
 * (notifications, search-index syncs, CRM webhooks, referral credits).
 *
 * The business rule is consistent across services: a failed side
 * effect must NEVER roll back the primary write, but it also must
 * NEVER vanish — ops would not know the chat notification dropped
 * until a customer complained. Previous code used `.catch(() => {})`
 * which satisfied the first half of the rule and violated the second.
 *
 * Usage:
 *   notifications.createNotification(...).catch(warnAndSwallow(this.logger, 'offer.notify'));
 *
 * The tag is a short, free-form string appearing in the log line so
 * a grep like `journalctl | grep swallowed=offer.notify` finds every
 * dropped offer notification without joining on the service name.
 */
export function warnAndSwallow(logger: Logger, tag: string) {
  return (err: unknown): void => {
    logger.warn(`swallowed=${tag} ${String(err).slice(0, 200)}`);
  };
}
