import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MIN_PAYOUT_BRL } from '@vintage/shared';
import { PayoutMethodsService } from './payout-methods.service';
import {
  MercadoPagoClient,
  MercadoPagoPayoutUnavailableError,
} from '../payments/mercadopago.client';
import { FraudService } from '../fraud/fraud.service';
import type { PayoutRequestStatus } from '@prisma/client';

/**
 * End-to-end payout request pipeline:
 *
 *   1. Validate caller (cpfIdentityVerified, active wallet, method ownership)
 *   2. Atomic debit of the wallet in one UPDATE ... WHERE balance >= amt
 *      (this is the ONLY race-safe anti-overdraft gate)
 *   3. Create a PayoutRequest row referencing the wallet transaction
 *   4. Call Mercado Pago to send the PIX payout
 *   5. Webhook or admin status update promotes PROCESSING → COMPLETED
 *      (or FAILED, which refunds the wallet in the same transaction)
 *
 * A MercadoPagoPayoutUnavailableError keeps the row PENDING so ops can
 * process it manually until the MP Marketplace contract activates. We
 * don't refund in that case — the debit IS correct from the user's POV;
 * it just hasn't yet been mirrored to an external PIX.
 */
@Injectable()
export class PayoutsService {
  private readonly logger = new Logger(PayoutsService.name);

  constructor(
    private prisma: PrismaService,
    private payoutMethods: PayoutMethodsService,
    private mp: MercadoPagoClient,
    private fraud: FraudService,
  ) {}

  async requestPayout(userId: string, amountBrl: number, payoutMethodId: string) {
    // --- Gates that must fail BEFORE any wallet/ledger write ---

    if (!Number.isFinite(amountBrl) || amountBrl <= 0) {
      throw new BadRequestException('Valor de saque inválido.');
    }
    if (amountBrl < MIN_PAYOUT_BRL) {
      throw new BadRequestException(`Valor mínimo para saque: R$${MIN_PAYOUT_BRL}`);
    }

    // Identity-verification gate. Upstream we accepted any linked
    // CPF (`cpf != null`) as a stopgap for launch. Before Track B
    // shipped, the gate was cpfChecksumValid (Modulo-11 only), which
    // trivially passes for every registered user and wasn't a real
    // protection. Now the bar is cpfIdentityVerified — true only
    // after a KYC provider (Serpro / Caf / Mercado Pago callback)
    // has confirmed CPF is ATIVO at Receita and the name matches.
    // This blocks payouts to unverified accounts at the API boundary,
    // which is a cleaner UX than letting MP's own KYC reject the
    // transfer 30 seconds later.
    const caller = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { cpf: true, cpfIdentityVerified: true },
    });
    if (!caller?.cpf) {
      throw new BadRequestException(
        'Adicione um CPF antes de solicitar saques. Vá em Conta → CPF.',
      );
    }
    if (!caller.cpfIdentityVerified) {
      throw new BadRequestException(
        'Verificação de identidade pendente. Conclua a verificação em Conta → Verificação para liberar saques.',
      );
    }

    // Ownership — throws ForbiddenException if the method belongs to
    // another user. Must run before debiting.
    const method = await this.payoutMethods.getOwnedOrThrow(userId, payoutMethodId);

    // Fraud check: a payout against a freshly-added payout method is
    // the classic account-compromise drain pattern. FLAG lets the
    // payout through with an admin flag; BLOCK short-circuits.
    const fraudDecision = await this.fraud.evaluatePayout(userId, payoutMethodId);
    if (fraudDecision.action === 'BLOCK') {
      throw new ForbiddenException(
        'Saque temporariamente bloqueado por nossa proteção contra fraude. Entre em contato com o suporte.',
      );
    }

    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) throw new NotFoundException('Carteira não encontrada');

    // Cheap pre-flight — friendly error when the balance is obviously
    // too low; the authoritative check is the conditional updateMany
    // inside the transaction below.
    const balance = Number(wallet.balanceBrl);
    if (balance <= 0 || amountBrl > balance) {
      throw new BadRequestException('Saldo insuficiente');
    }

    // --- Atomic debit + create-ledger + create-payout-request ---
    const { payoutRequest, walletTransactionId } = await this.prisma.$transaction(
      async (tx) => {
        // Conditional updateMany locks the row and rejects the second of
        // two concurrent debits (count=0) instead of driving the balance
        // negative. Same pattern as wallet.service.ts.
        const debit = await tx.wallet.updateMany({
          where: { id: wallet.id, balanceBrl: { gte: amountBrl } },
          data: { balanceBrl: { decrement: amountBrl } },
        });
        if (debit.count === 0) {
          throw new BadRequestException('Saldo insuficiente');
        }

        const ledger = await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            type: 'PAYOUT',
            amountBrl: -amountBrl,
            referenceId: method.id,
            description: 'Saque via PIX',
          },
        });

        const pr = await tx.payoutRequest.create({
          data: {
            userId,
            payoutMethodId: method.id,
            snapshotType: method.type,
            snapshotPixKey: method.pixKey,
            amountBrl,
            status: 'PENDING',
            walletTransactionId: ledger.id,
          },
        });

        return { payoutRequest: pr, walletTransactionId: ledger.id };
      },
    );

    // --- External call (outside the DB transaction on purpose) ---
    // A 15-second HTTP call inside a $transaction would hold the row
    // lock for 15s. Call MP AFTER commit; failure paths re-open a short
    // transaction to refund.
    try {
      const mpResult = await this.mp.sendPixPayout({
        externalReference: payoutRequest.id,
        pixKey: method.pixKey,
        pixKeyType: method.type,
        amountBrl,
        descriptionForRecipient: 'Vintage.br',
      });

      await this.prisma.payoutRequest.update({
        where: { id: payoutRequest.id },
        data: {
          status: mpResult.status,
          externalId: mpResult.externalId,
          processingAt: new Date(),
          completedAt: mpResult.status === 'COMPLETED' ? new Date() : null,
        },
      });

      return {
        success: true,
        payoutRequestId: payoutRequest.id,
        status: mpResult.status,
        newBalance: balance - amountBrl,
      };
    } catch (err) {
      // Contract not yet active — leave PENDING for ops. No refund.
      if (err instanceof MercadoPagoPayoutUnavailableError) {
        this.logger.log(
          `Payout ${payoutRequest.id} queued for ops — MP payout contract not active.`,
        );
        return {
          success: true,
          payoutRequestId: payoutRequest.id,
          status: 'PENDING' as const,
          newBalance: balance - amountBrl,
        };
      }

      // Real MP failure. Refund the wallet in an atomic transaction so
      // the ledger reflects reality: original debit + reversal credit +
      // PayoutRequest marked FAILED with reason.
      await this.failAndRefund(payoutRequest.id, walletTransactionId, wallet.id, amountBrl, String(err).slice(0, 300));
      throw new BadRequestException(
        'Não foi possível processar o saque no momento. O valor foi devolvido para sua carteira.',
      );
    }
  }

  /**
   * Ops-only endpoint path (wired via AdminGuard): mark a PayoutRequest
   * as COMPLETED or FAILED after a manual review. Used when the MP
   * contract isn't active yet and finance processes PIX out-of-band.
   *
   * FAILED triggers a wallet refund in the same transaction so the
   * seller's balance reflects reality.
   */
  async adminUpdateStatus(
    payoutRequestId: string,
    next: 'COMPLETED' | 'FAILED',
    failureReason?: string,
  ) {
    const pr = await this.prisma.payoutRequest.findUnique({
      where: { id: payoutRequestId },
    });
    if (!pr) throw new NotFoundException('PayoutRequest não encontrado');
    if (pr.status === 'COMPLETED' || pr.status === 'FAILED') {
      throw new BadRequestException('PayoutRequest já está em estado terminal.');
    }

    // Atomic claim. Two admins clicking "Fail" simultaneously on the
    // same payout both passed the outer terminal-state check above —
    // the previous code then fell through to `failAndRefundByRecord`
    // twice and credited the user's balanceBrl twice. The conditional
    // updateMany makes the transition single-shot: the first writer
    // wins (count=1) and commits the refund/completion; the second
    // writer sees count=0 and the method returns cleanly without
    // moving any money. Red-team finding R-02 (pen-test track 4).
    if (next === 'FAILED') {
      const claim = await this.prisma.payoutRequest.updateMany({
        where: {
          id: payoutRequestId,
          status: { in: ['PENDING', 'PROCESSING'] },
        },
        data: {
          status: 'FAILED',
          failureReason: failureReason ?? 'Falha marcada pelo suporte.',
          completedAt: new Date(),
        },
      });
      if (claim.count === 0) {
        // Lost the race (or the row was already terminal). Don't
        // throw — idempotent from ops' POV — but also don't refund.
        return { ok: true, status: 'FAILED' as const, alreadyTerminal: true };
      }
      // We won the claim. Refund the wallet in a separate tx. The
      // helper is now idempotent by construction (see R-03), so a
      // retry after a partial commit is safe.
      await this.refundWalletForFailedPayout(
        pr,
        failureReason ?? 'Falha marcada pelo suporte.',
      );
      return { ok: true, status: 'FAILED' as const };
    }

    const claim = await this.prisma.payoutRequest.updateMany({
      where: {
        id: payoutRequestId,
        status: { in: ['PENDING', 'PROCESSING'] },
      },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
    if (claim.count === 0) {
      return { ok: true, status: 'COMPLETED' as const, alreadyTerminal: true };
    }
    return { ok: true, status: 'COMPLETED' as const };
  }

  /**
   * Admin: list PayoutRequests that need attention. Default filter is
   * PENDING | PROCESSING (everything ops can still act on). Callers
   * may narrow by status. Never exposes snapshotPixKey — same rule as
   * the user-facing list.
   */
  async adminList(
    page: number = 1,
    pageSize: number = 20,
    status?: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED',
  ) {
    const p = Math.max(1, Number(page) || 1);
    const ps = Math.min(100, Math.max(1, Number(pageSize) || 20));
    const skip = (p - 1) * ps;

    const where = status
      ? { status }
      // Prisma's Enum`In` filter wants a mutable array — can't `as const`.
      : { status: { in: ['PENDING', 'PROCESSING'] as PayoutRequestStatus[] } };

    const [items, total] = await Promise.all([
      this.prisma.payoutRequest.findMany({
        where,
        orderBy: { requestedAt: 'asc' }, // oldest first — FIFO triage
        skip,
        take: ps,
        select: {
          id: true,
          userId: true,
          amountBrl: true,
          status: true,
          snapshotType: true,
          externalId: true,
          failureReason: true,
          requestedAt: true,
          processingAt: true,
          completedAt: true,
          user: { select: { id: true, name: true, email: true } },
        },
      }),
      this.prisma.payoutRequest.count({ where }),
    ]);

    return {
      items: items.map((it) => ({ ...it, amountBrl: Number(it.amountBrl) })),
      total,
      page: p,
      pageSize: ps,
      hasMore: skip + items.length < total,
    };
  }

  async listMine(userId: string, page: number = 1, pageSize: number = 20) {
    const p = Math.max(1, Number(page) || 1);
    const ps = Math.min(100, Math.max(1, Number(pageSize) || 20));
    const skip = (p - 1) * ps;

    const [items, total] = await Promise.all([
      this.prisma.payoutRequest.findMany({
        where: { userId },
        orderBy: { requestedAt: 'desc' },
        skip,
        take: ps,
        select: {
          id: true,
          amountBrl: true,
          status: true,
          snapshotType: true,
          requestedAt: true,
          completedAt: true,
          failureReason: true,
          // NEVER expose snapshotPixKey — we control access server-side.
        },
      }),
      this.prisma.payoutRequest.count({ where: { userId } }),
    ]);

    return {
      items: items.map((it) => ({ ...it, amountBrl: Number(it.amountBrl) })),
      total,
      page: p,
      pageSize: ps,
      hasMore: skip + items.length < total,
    };
  }

  /**
   * Auto-fail + refund path — called only when the MP send throws and
   * the PayoutRequest is still PENDING (never admin-claimed). Wraps
   * the status flip + wallet credit + ledger row in one transaction.
   * Uses a conditional updateMany on status so that a concurrent admin
   * adminUpdateStatus('FAILED') doesn't double-refund.
   */
  private async failAndRefund(
    payoutRequestId: string,
    walletTransactionId: string | null,
    walletId: string,
    amountBrl: number,
    failureReason: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Race guard. If an admin just claimed this PayoutRequest as
      // FAILED (and refunded) in a concurrent flow, their updateMany
      // moved status → FAILED and this one returns count=0 — we bail
      // without moving any money. Red-team finding R-03 (pen-test
      // track 4): the old code unconditionally credited the wallet
      // every time failAndRefund ran, so any double-invocation (two
      // admins clicking fail, admin clicking while MP-error-path was
      // still resolving, etc.) credited the user twice.
      const claim = await tx.payoutRequest.updateMany({
        where: {
          id: payoutRequestId,
          status: { in: ['PENDING', 'PROCESSING'] },
        },
        data: { status: 'FAILED', failureReason, completedAt: new Date() },
      });
      if (claim.count === 0) return;

      await tx.wallet.update({
        where: { id: walletId },
        data: { balanceBrl: { increment: amountBrl } },
      });
      await tx.walletTransaction.create({
        data: {
          walletId,
          type: 'REFUND',
          amountBrl,
          referenceId: payoutRequestId,
          description: 'Estorno de saque PIX (falha no processamento)',
        },
      });
      // Silence the unused-var warning — walletTransactionId is part of
      // the caller's context for future extension (e.g. voiding the
      // original debit rather than emitting a counter-credit).
      void walletTransactionId;
    });
  }

  /**
   * Admin-triggered refund. The caller has ALREADY claimed the row as
   * FAILED via a conditional updateMany (see adminUpdateStatus), so
   * this helper only needs to credit the wallet + write the ledger.
   * We do NOT re-flip the status — that would overwrite the admin's
   * winning claim on the off-chance a concurrent failAndRefund also
   * tried.
   */
  private async refundWalletForFailedPayout(
    pr: {
      id: string;
      userId: string;
      amountBrl: unknown;
      status: PayoutRequestStatus;
    },
    _failureReason: string,
  ): Promise<void> {
    const wallet = await this.prisma.wallet.findUnique({
      where: { userId: pr.userId },
    });
    if (!wallet) {
      throw new NotFoundException('Carteira do usuário não encontrada');
    }
    const amountBrl = Number(pr.amountBrl);

    await this.prisma.$transaction(async (tx) => {
      // Idempotency guard. If a REFUND walletTransaction already
      // exists for this payoutRequest, another path already refunded
      // — don't credit again.
      const prior = await tx.walletTransaction.findFirst({
        where: {
          walletId: wallet.id,
          referenceId: pr.id,
          type: 'REFUND',
        },
        select: { id: true },
      });
      if (prior) return;

      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balanceBrl: { increment: amountBrl } },
      });
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'REFUND',
          amountBrl,
          referenceId: pr.id,
          description: 'Estorno de saque PIX (falha no processamento)',
        },
      });
    });
  }

  /** Suppress the "only used as type" TS warning for ForbiddenException. */
  _unused_forbid = ForbiddenException;
}
