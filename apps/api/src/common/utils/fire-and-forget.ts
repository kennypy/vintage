import { Logger } from '@nestjs/common';
import { incrementSwallowCounter } from '../../metrics/metrics.service';

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
 * dropped offer notification without joining on the service name. It
 * ALSO labels the `vintage_fire_and_forget_swallowed_total` Prom
 * counter — alerts on sudden rate spikes of a specific tag catch the
 * "notifications silently failed for 2 hours" class of incident that
 * plain logs only surface during manual review.
 */
export function warnAndSwallow(logger: Logger, tag: string) {
  return (err: unknown): void => {
    logger.warn(`swallowed=${tag} ${String(err).slice(0, 200)}`);
    incrementSwallowCounter(tag);
  };
}
