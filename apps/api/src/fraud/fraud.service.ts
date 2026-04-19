import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Stable rule codes. The DB's FraudRule.code column references these
 * verbatim, so the dispatcher in `evaluate*` methods reads the row by
 * code and uses a matching branch to compute the check. Adding a new
 * rule = insert a row + add a branch.
 */
export const FRAUD_RULE_CODES = {
  NEW_ACCOUNT_VELOCITY: 'NEW_ACCOUNT_VELOCITY',
  PAYOUT_DRAIN: 'PAYOUT_DRAIN',
} as const;

export type FraudAction = 'FLAG' | 'BLOCK';
export interface FraudDecision {
  /** 'ALLOW' short-circuits — callers proceed. 'FLAG' creates a
   *  FraudFlag but callers still proceed. 'BLOCK' creates a flag AND
   *  callers MUST refuse the operation. */
  action: 'ALLOW' | FraudAction;
  ruleCode?: string;
  flagId?: string;
  reason?: string;
}

/** Number of days a User is considered "new" for velocity checks. */
const NEW_ACCOUNT_DAYS = 7;

@Injectable()
export class FraudService {
  private readonly logger = new Logger(FraudService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Evaluate a buyer about to place an order. Today this runs the
   * NEW_ACCOUNT_VELOCITY rule only; add more checks as patterns
   * emerge.
   *
   * Fail-open on evaluator errors: we'd rather let a legit purchase
   * through than 500 a legitimate buyer because the FraudRule table
   * hiccupped. The admin flag queue is the safety net, not this
   * function's uptime.
   */
  async evaluatePurchase(buyerId: string): Promise<FraudDecision> {
    try {
      const rule = await this.getRule(FRAUD_RULE_CODES.NEW_ACCOUNT_VELOCITY);
      if (!rule) return { action: 'ALLOW' };

      const buyer = await this.prisma.user.findUnique({
        where: { id: buyerId },
        select: { createdAt: true },
      });
      if (!buyer) return { action: 'ALLOW' };

      const accountAgeDays =
        (Date.now() - buyer.createdAt.getTime()) / (24 * 60 * 60 * 1000);
      if (accountAgeDays > NEW_ACCOUNT_DAYS) return { action: 'ALLOW' };

      const since = new Date(Date.now() - rule.windowMinutes * 60 * 1000);
      const recentOrders = await this.prisma.order.count({
        where: { buyerId, createdAt: { gte: since } },
      });

      if (recentOrders < rule.threshold) return { action: 'ALLOW' };

      // Defensive: a missing or future-dated user.createdAt yields NaN /
      // Infinity from the time math above. Coerce to a reasonable
      // sentinel so the JSON evidence column never ships a `NaN` string
      // (Prisma JSON serialises NaN to null but downstream Postgres ⇒
      // BI tooling chokes on the round-trip).
      const safeAccountAgeDays = Number.isFinite(accountAgeDays)
        ? Math.round(accountAgeDays * 10) / 10
        : -1;
      const flag = await this.createFlag(buyerId, rule.code, {
        accountAgeDays: safeAccountAgeDays,
        ordersInWindow: recentOrders,
        windowMinutes: rule.windowMinutes,
        threshold: rule.threshold,
      });
      return {
        action: rule.action as FraudAction,
        ruleCode: rule.code,
        flagId: flag?.id,
        reason: rule.description,
      };
    } catch (err) {
      this.logger.warn(
        `evaluatePurchase failed for ${buyerId}: ${String(err).slice(0, 200)}`,
      );
      return { action: 'ALLOW' };
    }
  }

  /**
   * Evaluate a seller requesting a payout. Runs PAYOUT_DRAIN: flag
   * when the chosen PayoutMethod was created inside the rule's
   * window (default 60 min). Classic account-compromise signal.
   */
  async evaluatePayout(
    userId: string,
    payoutMethodId: string,
  ): Promise<FraudDecision> {
    try {
      const rule = await this.getRule(FRAUD_RULE_CODES.PAYOUT_DRAIN);
      if (!rule) return { action: 'ALLOW' };

      const method = await this.prisma.payoutMethod.findUnique({
        where: { id: payoutMethodId },
        select: { createdAt: true, userId: true },
      });
      if (!method || method.userId !== userId) return { action: 'ALLOW' };

      const ageMinutes =
        (Date.now() - method.createdAt.getTime()) / (60 * 1000);
      if (ageMinutes > rule.windowMinutes) return { action: 'ALLOW' };

      const flag = await this.createFlag(userId, rule.code, {
        payoutMethodAgeMinutes: Number.isFinite(ageMinutes)
          ? Math.round(ageMinutes * 10) / 10
          : -1,
        windowMinutes: rule.windowMinutes,
      });
      return {
        action: rule.action as FraudAction,
        ruleCode: rule.code,
        flagId: flag?.id,
        reason: rule.description,
      };
    } catch (err) {
      this.logger.warn(
        `evaluatePayout failed for ${userId}: ${String(err).slice(0, 200)}`,
      );
      return { action: 'ALLOW' };
    }
  }

  private async getRule(code: string) {
    return this.prisma.fraudRule.findFirst({
      where: { code, enabled: true },
    });
  }

  /**
   * Dedup by (userId, ruleCode) within a short window so a single
   * bursty buyer doesn't flood the admin queue with 20 identical
   * flags per minute — one is enough to open an investigation.
   */
  private async createFlag(
    userId: string,
    ruleCode: string,
    evidence: Record<string, unknown>,
  ) {
    const since = new Date(Date.now() - 60 * 60 * 1000); // 1h dedupe window
    const recent = await this.prisma.fraudFlag.findFirst({
      where: {
        userId,
        ruleCode,
        status: 'PENDING',
        createdAt: { gte: since },
      },
      select: { id: true },
    });
    if (recent) return recent;

    try {
      const created = await this.prisma.fraudFlag.create({
        data: { userId, ruleCode, evidence: evidence as object },
      });
      this.logger.warn(
        `FraudFlag created: ${ruleCode} for user ${userId} — ${JSON.stringify(evidence)}`,
      );
      return created;
    } catch (err) {
      this.logger.warn(
        `FraudFlag create failed for ${userId}:${ruleCode}: ${String(err).slice(0, 200)}`,
      );
      return null;
    }
  }

  // --- Admin queue ---

  async listPendingFlags(page = 1, pageSize = 20) {
    page = Math.max(1, Number(page) || 1);
    pageSize = Math.min(100, Math.max(1, Number(pageSize) || 20));
    const skip = (page - 1) * pageSize;

    const where = { status: 'PENDING' as const };
    const [items, total] = await Promise.all([
      this.prisma.fraudFlag.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, email: true, createdAt: true } },
        },
        orderBy: { createdAt: 'asc' },
        skip,
        take: pageSize,
      }),
      this.prisma.fraudFlag.count({ where }),
    ]);

    return { items, total, page, pageSize, hasMore: skip + items.length < total };
  }

  async resolveFlag(
    flagId: string,
    action: 'DISMISS' | 'REVIEWED',
    adminId: string,
    note?: string,
  ) {
    const flag = await this.prisma.fraudFlag.findUnique({ where: { id: flagId } });
    if (!flag) return { resolved: false, reason: 'not_found' as const };
    if (flag.status !== 'PENDING') {
      return { resolved: false, reason: 'already_resolved' as const };
    }

    const nextStatus = action === 'DISMISS' ? 'DISMISSED' : 'REVIEWED';
    await this.prisma.fraudFlag.update({
      where: { id: flagId },
      data: {
        status: nextStatus,
        reviewedById: adminId,
        reviewedAt: new Date(),
        reviewNote: note?.slice(0, 500) ?? null,
      },
    });
    this.logger.log(
      `FraudFlag ${flagId} (${flag.ruleCode}) resolved as ${nextStatus} by ${adminId}`,
    );
    return { resolved: true, status: nextStatus };
  }
}
