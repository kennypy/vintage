import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PostHog } from 'posthog-node';

/**
 * Stable event vocabulary for the activation + payment funnels.
 *
 * These are the cross-session anchors — whatever a future dashboard
 * slices by, it slices by THESE names. Rename-with-compat only;
 * deleting an event name silently breaks historical funnels.
 *
 * Server-side events only at launch. We're skipping client-side
 * instrumentation (web + mobile SDKs) until we see what we actually
 * need — PostHog's server-side stream covers the whole funnel from
 * signup to payout already. Client-side comes later for pageview /
 * scroll / button-level signal.
 */
export const AnalyticsEvents = {
  USER_REGISTERED: 'user_registered',
  LISTING_CREATED: 'listing_created',
  ORDER_CREATED: 'order_created',
  ORDER_PAID: 'order_paid',
  ORDER_DELIVERED: 'order_delivered',
  DISPUTE_OPENED: 'dispute_opened',
} as const;

export type AnalyticsEvent = (typeof AnalyticsEvents)[keyof typeof AnalyticsEvents];

/**
 * PostHog wrapper. Off by default — when POSTHOG_API_KEY isn't set
 * every call is a no-op, which is exactly what we want in unit tests
 * and local dev. When enabled it captures to PostHog's EU region
 * (LGPD-friendlier than the US one for Brazilian users).
 *
 * Fail-open contract: analytics must never break a user-facing call.
 * Every capture is wrapped in try/catch and logs-without-throwing on
 * failure. Callers are expected to call `capture(...)` synchronously
 * and never await its return.
 */
@Injectable()
export class AnalyticsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AnalyticsService.name);
  private client: PostHog | null = null;
  private readonly apiKey: string;
  private readonly host: string;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('POSTHOG_API_KEY', '');
    this.host = this.configService.get<string>(
      'POSTHOG_HOST',
      'https://eu.i.posthog.com',
    );
  }

  onModuleInit() {
    if (!this.apiKey) {
      this.logger.warn(
        'POSTHOG_API_KEY not set — analytics disabled (no events will be captured).',
      );
      return;
    }
    this.client = new PostHog(this.apiKey, {
      host: this.host,
      // Batch events and flush every 10s OR every 20 events. The
      // defaults are fine but pinning explicitly makes the cost
      // profile obvious in code review.
      flushAt: 20,
      flushInterval: 10_000,
    });
    this.logger.log(`PostHog analytics enabled (host: ${this.host})`);
  }

  async onModuleDestroy() {
    if (!this.client) return;
    try {
      await this.client.shutdown();
    } catch (err) {
      this.logger.warn(
        `PostHog shutdown threw: ${String(err).slice(0, 200)}`,
      );
    }
  }

  /**
   * Fire-and-forget event capture. `distinctId` must be the stable
   * application user id (User.id, a cuid), NOT email / CPF / phone —
   * we don't want PII flowing into the analytics pipeline.
   */
  capture(
    distinctId: string,
    event: AnalyticsEvent,
    properties: Record<string, unknown> = {},
  ): void {
    if (!this.client) return;
    try {
      this.client.capture({
        distinctId,
        event,
        properties: {
          ...properties,
          // Pinned so "platform" slicing works out of the box;
          // lets us tell server-side events apart from any future
          // client-side SDKs when we add them.
          $lib: 'vintage-api',
        },
      });
    } catch (err) {
      this.logger.warn(
        `analytics capture failed for ${event}: ${String(err).slice(0, 200)}`,
      );
    }
  }
}
