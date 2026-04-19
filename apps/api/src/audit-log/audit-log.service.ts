import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Free-form context attached to an audit-log row. Keep it small +
 * queryable — think "searchable in the admin dashboard a year from
 * now", not "dump of the whole request body".
 *
 * Never put secrets in here. The row is queryable by non-root DB
 * readers; anything sensitive (passwords, API keys, raw PIX keys,
 * unmasked CPF, tokens) must be redacted or omitted entirely.
 */
export type AuditLogMetadata = Record<
  string,
  string | number | boolean | null | undefined
>;

export interface AuditLogEntry {
  actorId: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: AuditLogMetadata | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Central audit-log writer. Every privileged admin action (role
 * promotion, dispute resolution, payout status flip, feature-flag
 * edit, authenticity review, coupon creation, user ban) writes one
 * row here.
 *
 * Contract:
 *   * Writes are best-effort — if the DB is briefly unavailable we
 *     log-and-swallow rather than fail the primary action. A dropped
 *     audit row is bad, but an auth bypass caused by the audit write
 *     throwing is worse.
 *   * Rows are never mutated or deleted by app code. `actor` is
 *     SetNull on User delete so an LGPD erasure doesn't tank the
 *     audit chain.
 *   * Metadata is a shallow JSON map of scalars. Keep it queryable.
 */
@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditLogEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId: entry.actorId ?? null,
          action: entry.action,
          targetType: entry.targetType ?? null,
          targetId: entry.targetId ?? null,
          // Prisma's Json column accepts undefined (= don't set) but
          // not null here unless the column is explicitly Nullable Json.
          // Coerce null → undefined so `metadata` is omitted entirely
          // on no-metadata calls.
          metadata: entry.metadata ?? Prisma.JsonNull,
          ipAddress: entry.ipAddress?.slice(0, 64) ?? null,
          userAgent: entry.userAgent?.slice(0, 512) ?? null,
        },
      });
    } catch (err) {
      this.logger.error(
        `Failed to write AuditLog entry action=${entry.action} target=${entry.targetType}:${entry.targetId}: ${String(err).slice(0, 200)}`,
      );
    }
  }
}
