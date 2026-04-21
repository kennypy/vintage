import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { Decimal } from '@prisma/client/runtime/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { REFERRAL_REWARD_BRL } from '@vintage/shared';

/**
 * Invite-a-friend reward loop.
 *
 * Flow:
 *   1. Every user gets a stable `referralCode` at registration (8 chars,
 *      uppercase alphanumeric). Generated here, persisted on User.
 *   2. New signup with `referralCode` in the register DTO creates a
 *      Referral row linking referrer + referee. Reward is not credited
 *      yet — pending until the referee completes their first order.
 *   3. OrdersService calls `creditIfEligible(refereeId)` when an order
 *      enters COMPLETED. If the referee has a pending Referral, both
 *      wallets get REFERRAL_REWARD_BRL + `rewardCreditedAt` is set so
 *      the reward can't double-credit.
 *
 * Anti-fraud:
 *   - Self-referral blocked at redeem (referrer != referee)
 *   - One Referral per referee (schema @@unique([refereeId]))
 *   - Reward only fires on actual completed order — fake signups don't
 *     earn rewards until money actually moved
 */
@Injectable()
export class ReferralsService {
  private readonly logger = new Logger(ReferralsService.name);

  // 8 chars from the unambiguous alphabet (no I/O/0/1 confusion).
  private static readonly ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  private static readonly CODE_LENGTH = 8;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Generate a unique referral code. Retries on the astronomically-
   * unlikely collision on the unique index (expected p ≈ 0 at
   * 32^8 = 1.1 trillion codes). Caller-scoped — writes to User.referralCode.
   */
  async generateUniqueCode(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = this.randomCode();
      const collision = await this.prisma.user.findUnique({
        where: { referralCode: code },
        select: { id: true },
      });
      if (!collision) return code;
    }
    // If we got here the RNG or the unique index is behaving weirdly;
    // throw rather than silently degrade to non-unique codes.
    throw new Error('referral code collision cap exceeded');
  }

  private randomCode(): string {
    const bytes = crypto.randomBytes(ReferralsService.CODE_LENGTH);
    let out = '';
    for (let i = 0; i < ReferralsService.CODE_LENGTH; i++) {
      out += ReferralsService.ALPHABET[bytes[i] % ReferralsService.ALPHABET.length];
    }
    return out;
  }

  /**
   * Link a fresh registration to its inviter. Called from AuthService
   * right after the User row exists. Never throws — a bad / unknown
   * code silently drops the link so signup itself isn't blocked.
   */
  async linkReferralAtSignup(refereeId: string, rawCode: string | undefined): Promise<void> {
    if (!rawCode) return;
    const code = rawCode.trim().toUpperCase();
    if (code.length !== ReferralsService.CODE_LENGTH) return;

    try {
      const referrer = await this.prisma.user.findUnique({
        where: { referralCode: code },
        select: { id: true, deletedAt: true, isBanned: true },
      });
      if (!referrer) return;
      if (referrer.deletedAt || referrer.isBanned) return;
      if (referrer.id === refereeId) return; // self-referral

      await this.prisma.referral.create({
        data: {
          referrerId: referrer.id,
          refereeId,
          code,
        },
      });
    } catch (err) {
      // unique-key collision (referee already linked) or other — just log
      const code = (err as { code?: string })?.code;
      if (code === 'P2002') return;
      this.logger.warn(`linkReferralAtSignup failed: ${String(err).slice(0, 200)}`);
    }
  }

  /**
   * Credit referrer + referee if there's a pending Referral for the
   * given refereeId. Called from the orders finalize/complete path.
   * Idempotent — if the reward already fired (rewardCreditedAt set),
   * no-op.
   */
  async creditIfEligible(refereeId: string): Promise<void> {
    try {
      const referral = await this.prisma.referral.findUnique({
        where: { refereeId },
      });
      if (!referral || referral.rewardCreditedAt) return;

      const reward = Number(REFERRAL_REWARD_BRL);
      await this.prisma.$transaction(async (tx) => {
        // Atomic claim: only proceed if rewardCreditedAt is still null.
        const claim = await tx.referral.updateMany({
          where: { id: referral.id, rewardCreditedAt: null },
          data: {
            rewardCreditedAt: new Date(),
            rewardAmountBrl: new Decimal(reward.toFixed(2)),
          },
        });
        if (claim.count === 0) return;

        for (const userId of [referral.referrerId, refereeId]) {
          const wallet = await tx.wallet.upsert({
            where: { userId },
            create: { userId, balanceBrl: 0, pendingBrl: 0 },
            update: {},
          });
          await tx.wallet.update({
            where: { id: wallet.id },
            data: { balanceBrl: { increment: reward } },
          });
          await tx.walletTransaction.create({
            data: {
              walletId: wallet.id,
              type: 'CREDIT',
              amountBrl: new Decimal(reward.toFixed(2)),
              referenceId: referral.id,
              description: `Bônus de indicação Vintage.br`,
            },
          });
        }
      });

      this.notifications
        .createNotification(
          referral.referrerId,
          'referral',
          'Bônus de indicação recebido!',
          `Sua indicação fez a primeira compra. Você ganhou R$ ${Number(REFERRAL_REWARD_BRL).toFixed(2)} de crédito na carteira.`,
          { referralId: referral.id },
          'news',
        )
        .catch(() => {});
      this.notifications
        .createNotification(
          refereeId,
          'referral',
          'Bônus de boas-vindas!',
          `Você ganhou R$ ${Number(REFERRAL_REWARD_BRL).toFixed(2)} de crédito por ter sido convidada ao Vintage.br.`,
          { referralId: referral.id },
          'news',
        )
        .catch(() => {});
    } catch (err) {
      this.logger.warn(
        `creditIfEligible failed for referee ${refereeId}: ${String(err).slice(0, 200)}`,
      );
    }
  }

  /**
   * Returns the caller's referral code (creating one if the user
   * registered before the referral feature existed) + list of their
   * invitees with reward status.
   */
  async getMyReferrals(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { referralCode: true },
    });
    if (!user) throw new NotFoundException('Usuário não encontrado');

    let code = user.referralCode;
    if (!code) {
      code = await this.generateUniqueCode();
      await this.prisma.user.update({
        where: { id: userId },
        data: { referralCode: code },
      });
    }

    const referrals = await this.prisma.referral.findMany({
      where: { referrerId: userId },
      include: {
        referee: { select: { id: true, name: true, avatarUrl: true, createdAt: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const totalRewardsBrl = referrals
      .filter((r) => r.rewardCreditedAt)
      .reduce((sum, r) => sum + Number(r.rewardAmountBrl ?? 0), 0);

    return {
      code,
      rewardAmountBrl: Number(REFERRAL_REWARD_BRL),
      totalRewardsBrl,
      totalInvited: referrals.length,
      totalRewarded: referrals.filter((r) => r.rewardCreditedAt).length,
      referrals: referrals.map((r) => ({
        id: r.id,
        refereeName: r.referee.name,
        refereeAvatarUrl: r.referee.avatarUrl,
        rewardedAt: r.rewardCreditedAt,
        invitedAt: r.createdAt,
      })),
    };
  }

  /**
   * Admin-visible: has this code been redeemed? Used for fraud triage.
   */
  async validateCode(code: string) {
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length !== ReferralsService.CODE_LENGTH) {
      throw new BadRequestException('Código inválido');
    }
    const owner = await this.prisma.user.findUnique({
      where: { referralCode: trimmed },
      select: { id: true, name: true, deletedAt: true, isBanned: true },
    });
    if (!owner || owner.deletedAt || owner.isBanned) {
      throw new NotFoundException('Código não encontrado ou inativo');
    }
    return { valid: true, referrerName: owner.name };
  }
}

// Re-export of ConflictException so tests / consumers who need it have a
// stable path — keeps the service file as the sole owner of the surface.
export { ConflictException };
