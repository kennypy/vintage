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
import type { PayoutRequestStatus } from '@prisma/client';

/**
 * End-to-end payout request pipeline:
 *
 *   1. Validate caller (cpfVerified, active wallet, method ownership)
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
  ) {}

  async requestPayout(userId: string, amountBrl: number, payoutMethodId: string) {
    // --- Gates that must fail BEFORE any wallet/ledger write ---

    if (!Number.isFinite(amountBrl) || amountBrl <= 0) {
      throw new BadRequestException('Valor de saque inválido.');
    }
    if (amountBrl < MIN_PAYOUT_BRL) {
      throw new BadRequestException(`Valor mínimo para saque: R$${MIN_PAYOUT_BRL}`);
    }

    // cpfVerified gate (Wave 3C). Upstream we accepted any linked CPF
    // (`cpf != null`) as a stopgap for launch. Now Receita Federal /
    // identity-verification is the bar — Mercado Pago's own KYC refuses
    // payouts to unverified CPFs anyway, so failing at the API boundary
    // is a clearer UX than a generic MP reject 30 seconds later.
    const caller = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { cpf: true, cpfVerified: true },
    });
    if (!caller?.cpf) {
      throw new BadRequestException(
        'Adicione um CPF antes de solicitar saques. Vá em Conta → CPF.',
      );
    }
    if (!caller.cpfVerified) {
      throw new BadRequestException(
        'CPF não verificado. Envie seu documento em Conta → Verificação antes de solicitar saques.',
      );
    }

    // Ownership — throws ForbiddenException if the method belongs to
    // another user. Must run before debiting.
    const method = await this.payoutMethods.getOwnedOrThrow(userId, payoutMethodId);

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

    if (next === 'FAILED') {
      await this.failAndRefundByRecord(pr, failureReason ?? 'Falha marcada pelo suporte.');
      return { ok: true, status: 'FAILED' as const };
    }

    await this.prisma.payoutRequest.update({
      where: { id: payoutRequestId },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
    return { ok: true, status: 'COMPLETED' as const };
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

  private async failAndRefund(
    payoutRequestId: string,
    walletTransactionId: string | null,
    walletId: string,
    amountBrl: number,
    failureReason: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
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
      await tx.payoutRequest.update({
        where: { id: payoutRequestId },
        data: {
          status: 'FAILED',
          failureReason,
          completedAt: new Date(),
        },
      });
      // Silence the unused-var warning — walletTransactionId is part of
      // the caller's context for future extension (e.g. voiding the
      // original debit rather than emitting a counter-credit).
      void walletTransactionId;
    });
  }

  private async failAndRefundByRecord(
    pr: {
      id: string;
      userId: string;
      amountBrl: unknown;
      walletTransactionId: string | null;
      status: PayoutRequestStatus;
    },
    failureReason: string,
  ): Promise<void> {
    const wallet = await this.prisma.wallet.findUnique({
      where: { userId: pr.userId },
    });
    if (!wallet) {
      // Shouldn't happen — wallets are created on signup — but fail loud.
      throw new NotFoundException('Carteira do usuário não encontrada');
    }
    await this.failAndRefund(
      pr.id,
      pr.walletTransactionId,
      wallet.id,
      Number(pr.amountBrl),
      failureReason,
    );
  }

  /** Suppress the "only used as type" TS warning for ForbiddenException. */
  _unused_forbid = ForbiddenException;
}
