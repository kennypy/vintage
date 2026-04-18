import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PayoutsService } from './payouts.service';

@Injectable()
export class WalletService {
  constructor(
    private prisma: PrismaService,
    private payouts: PayoutsService,
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
   * Thin compatibility wrapper — the actual payout pipeline moved to
   * PayoutsService in Wave 3C (adds PayoutRequest tracking + real MP
   * integration). Left here so external callers that still hit
   * WalletService.requestPayout keep working.
   */
  async requestPayout(userId: string, amountBrl: number, payoutMethodId: string) {
    return this.payouts.requestPayout(userId, amountBrl, payoutMethodId);
  }
}
