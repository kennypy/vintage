import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MIN_PAYOUT_BRL } from '@vintage/shared';

@Injectable()
export class WalletService {
  constructor(private prisma: PrismaService) {}

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

  async requestPayout(userId: string, amountBrl: number) {
    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) throw new NotFoundException('Carteira não encontrada');

    // Guard against non-positive amounts (NaN, zero, negative)
    if (!Number.isFinite(amountBrl) || amountBrl <= 0) {
      throw new BadRequestException('Valor de saque inválido.');
    }

    if (amountBrl < MIN_PAYOUT_BRL) {
      throw new BadRequestException(`Valor mínimo para saque: R$${MIN_PAYOUT_BRL}`);
    }

    const balance = Number(wallet.balanceBrl);

    // Must have a positive balance before any payout can be requested
    if (balance <= 0) {
      throw new BadRequestException('Saldo insuficiente para solicitar saque.');
    }

    if (amountBrl > balance) {
      throw new BadRequestException('Saldo insuficiente');
    }

    await this.prisma.$transaction([
      this.prisma.wallet.update({
        where: { id: wallet.id },
        data: { balanceBrl: { decrement: amountBrl } },
      }),
      this.prisma.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'PAYOUT',
          amountBrl: -amountBrl,
          description: 'Saque para conta bancária via PIX',
        },
      }),
    ]);

    return { success: true, newBalance: balance - amountBrl };
  }
}
