import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MIN_PAYOUT_BRL } from '@vintage/shared';
import { PayoutMethodsService } from './payout-methods.service';

@Injectable()
export class WalletService {
  constructor(
    private prisma: PrismaService,
    private payoutMethods: PayoutMethodsService,
  ) {}

  async getWallet(userId: string) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
    });
    if (!wallet) throw new NotFoundException('Carteira não encontrada');
    return wallet;
  }

  async getTransactions(userId: string, page: number = 1, pageSize: number = 20) {
    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) throw new NotFoundException('Carteira não encontrada');

    const p = Math.max(1, Number(page) || 1);
    const ps = Math.min(100, Math.max(1, Number(pageSize) || 20));
    page = p; pageSize = ps;
    const skip = (page - 1) * pageSize;
    const [items, total] = await Promise.all([
      this.prisma.walletTransaction.findMany({
        where: { walletId: wallet.id },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.walletTransaction.count({ where: { walletId: wallet.id } }),
    ]);

    return { items, total, page, pageSize, hasMore: skip + items.length < total };
  }

  /**
   * Request a PIX payout against a saved payout method. The method MUST
   * belong to `userId` — ownership is enforced by PayoutMethodsService.
   * The raw PIX key is never returned; the transaction record only keeps
   * the method's ID for audit trail.
   *
   * Race safety: the balance check is enforced at the DB row level via a
   * conditional `updateMany({ where: { balanceBrl: { gte: amountBrl } } })`.
   * Two concurrent requests each asking for 80 BRL against a 100 BRL wallet
   * serialise at the row lock — the second one's WHERE clause no longer
   * matches and `count` is 0, so we throw instead of driving the balance
   * negative. Pure Prisma `decrement` on `update` would not catch this.
   */
  async requestPayout(userId: string, amountBrl: number, payoutMethodId: string) {
    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) throw new NotFoundException('Carteira não encontrada');

    // Guard against non-positive amounts (NaN, zero, negative)
    if (!Number.isFinite(amountBrl) || amountBrl <= 0) {
      throw new BadRequestException('Valor de saque inválido.');
    }

    if (amountBrl < MIN_PAYOUT_BRL) {
      throw new BadRequestException(`Valor mínimo para saque: R$${MIN_PAYOUT_BRL}`);
    }

    // Validates ownership — throws ForbiddenException if the method belongs
    // to another user. Must run before debiting the wallet.
    const method = await this.payoutMethods.getOwnedOrThrow(userId, payoutMethodId);

    // Cheap pre-flight — gives a friendly "Saldo insuficiente" without
    // opening a transaction when the balance is obviously too low.
    const balance = Number(wallet.balanceBrl);
    if (balance <= 0 || amountBrl > balance) {
      throw new BadRequestException('Saldo insuficiente');
    }

    // Atomic debit + ledger row. The conditional updateMany is the
    // authoritative race-safe check; the create only runs if the debit
    // succeeded inside the same transaction.
    const updatedAt = await this.prisma.$transaction(async (tx) => {
      const debit = await tx.wallet.updateMany({
        where: { id: wallet.id, balanceBrl: { gte: amountBrl } },
        data: { balanceBrl: { decrement: amountBrl } },
      });
      if (debit.count === 0) {
        // Another payout consumed the balance after our pre-flight read.
        throw new BadRequestException('Saldo insuficiente');
      }
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'PAYOUT',
          amountBrl: -amountBrl,
          // referenceId is the PayoutMethod.id, not the raw PIX key.
          referenceId: method.id,
          description: 'Saque via PIX',
        },
      });
      // Re-read to return the authoritative post-debit balance.
      return tx.wallet.findUnique({ where: { id: wallet.id }, select: { balanceBrl: true } });
    });

    return { success: true, newBalance: Number(updatedAt?.balanceBrl ?? 0) };
  }
}
