import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  Counter,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from 'prom-client';

/**
 * Structured security-event metrics. We already log every interesting
 * event (auth failures, CSRF rejections, refresh-token reuse, payment
 * anomalies, webhook signature rejections, etc.) but log lines are
 * only useful when an operator is reading them. Metrics turn the same
 * events into dashboards + alerts — "auth_login_failed_total jumped
 * 10x in 5 minutes" triggers a page before the attacker finishes the
 * credential-stuffing run.
 *
 * Every counter here is an append-only signal. No PII — counters are
 * incremented by label (provider, outcome, action), not by user id.
 * The /metrics endpoint itself is Prometheus-format and MUST be
 * scraped from a trusted network (configure Fly internal port or
 * require a pull-secret at the LB).
 */
@Injectable()
export class MetricsService implements OnModuleInit {
  private readonly logger = new Logger(MetricsService.name);
  readonly registry = new Registry();

  // Auth surface
  readonly authLoginFailed = new Counter({
    name: 'vintage_auth_login_failed_total',
    help: 'Failed /auth/login attempts by reason (wrong_password, unknown_email, locked, captcha_failed, etc).',
    labelNames: ['reason'] as const,
    registers: [this.registry],
  });
  readonly authLoginLocked = new Counter({
    name: 'vintage_auth_login_locked_total',
    help: 'Number of times the per-email login lockout tripped.',
    registers: [this.registry],
  });
  readonly authRefreshReuse = new Counter({
    name: 'vintage_auth_refresh_reuse_detected_total',
    help: 'Refresh-token reuse-detection events. Each one is a strong theft signal.',
    registers: [this.registry],
  });
  readonly authCsrfRejected = new Counter({
    name: 'vintage_auth_csrf_rejected_total',
    help: 'Requests rejected by CsrfMiddleware (missing / invalid token).',
    labelNames: ['reason'] as const,
    registers: [this.registry],
  });

  // Payment surface
  readonly paymentFlagCreated = new Counter({
    name: 'vintage_payment_flag_created_total',
    help: 'PaymentFlag rows created — each is a manual-review escalation (amount mismatch, anomaly).',
    labelNames: ['reason'] as const,
    registers: [this.registry],
  });
  readonly webhookSignatureRejected = new Counter({
    name: 'vintage_webhook_signature_rejected_total',
    help: 'Inbound webhooks rejected by signature check. Spike = attempted forgery.',
    labelNames: ['provider'] as const,
    registers: [this.registry],
  });
  readonly webhookDuplicate = new Counter({
    name: 'vintage_webhook_duplicate_total',
    help: 'Inbound webhooks that short-circuited as duplicates (dedup working).',
    labelNames: ['provider'] as const,
    registers: [this.registry],
  });

  // Privacy / LGPD
  readonly privacyAudit = new Counter({
    name: 'vintage_privacy_audit_total',
    help: 'Privacy-sensitive admin actions (email substring search, data export, etc).',
    labelNames: ['action'] as const,
    registers: [this.registry],
  });

  // Durable-operation latency
  readonly orderCreate = new Histogram({
    name: 'vintage_order_create_duration_seconds',
    help: 'Time to create an order end-to-end (transaction + snapshot + search update).',
    buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [this.registry],
  });

  onModuleInit(): void {
    // Default Node runtime metrics: GC pauses, event-loop lag, heap,
    // resident memory. Dashboards use these to correlate a security
    // spike with infrastructure stress (e.g. GC thrashing during a
    // DoS attempt).
    collectDefaultMetrics({
      register: this.registry,
      prefix: 'vintage_',
    });
    this.logger.log('Metrics registry initialised');
  }

  /** Emit a single text/plain Prometheus-format snapshot. */
  async snapshot(): Promise<string> {
    return this.registry.metrics();
  }
}
