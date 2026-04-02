import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Decimal } from '@prisma/client/runtime/client';
import { PrismaService } from '../prisma/prisma.service';
import { OrdersService } from './orders.service';
import { SHIPPING_DEADLINE_DAYS } from '@vintage/shared';

@Injectable()
export class OrdersCronService {
  private readonly logger = new Logger(OrdersCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersService: OrdersService,
  ) {}

  /**
   * Auto-confirm delivered orders whose dispute window has expired.
   * Releases escrowed funds to the seller.
   * Runs every hour.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async autoConfirmOrders() {
    const now = new Date();

    const expiredOrders = await this.prisma.order.findMany({
      where: {
        status: 'DELIVERED',
        disputeDeadline: { lt: now },
      },
      select: { id: true },
    });

    if (expiredOrders.length === 0) return;

    this.logger.log(
      `Auto-confirming ${expiredOrders.length} orders past dispute deadline`,
    );

    for (const order of expiredOrders) {
      try {
        await this.ordersService.releaseEscrow(order.id);
        this.logger.log(`Auto-confirmed order ${order.id}`);
      } catch (err) {
        this.logger.error(
          `Failed to auto-confirm order ${order.id}: ${String(err).slice(0, 200)}`,
        );
      }
    }
  }

  /**
   * Auto-cancel PAID orders where the seller has not shipped within
   * the shipping deadline. Reverses the escrow hold and refunds the buyer.
   * Runs every hour.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async autoCancelUnshippedOrders() {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - SHIPPING_DEADLINE_DAYS);

    const staleOrders = await this.prisma.order.findMany({
      where: {
        status: 'PAID',
        createdAt: { lt: cutoff },
        shippedAt: null,
      },
      include: { listing: { select: { id: true, title: true } } },
    });

    if (staleOrders.length === 0) return;

    this.logger.log(
      `Auto-cancelling ${staleOrders.length} unshipped orders past ${SHIPPING_DEADLINE_DAYS}-day deadline`,
    );

    for (const order of staleOrders) {
      try {
        const itemAmount = Number(order.itemPriceBrl);
        const refundAmount = Number(order.totalBrl);

        await this.prisma.$transaction(async (tx) => {
          // Cancel the order
          await tx.order.update({
            where: { id: order.id },
            data: { status: 'CANCELLED' },
          });

          // Reverse escrow hold on seller's wallet
          const sellerWallet = await tx.wallet.findUnique({
            where: { userId: order.sellerId },
          });

          if (sellerWallet) {
            await tx.wallet.update({
              where: { id: sellerWallet.id },
              data: { pendingBrl: { decrement: itemAmount } },
            });

            await tx.walletTransaction.create({
              data: {
                walletId: sellerWallet.id,
                type: 'ESCROW_RELEASE',
                amountBrl: new Decimal((-itemAmount).toFixed(2)),
                referenceId: order.id,
                description: `Custódia revertida (não enviado): ${order.listing.title}`,
              },
            });
          }

          // Refund buyer (store credit)
          const buyerWallet = await tx.wallet.upsert({
            where: { userId: order.buyerId },
            create: { userId: order.buyerId, balanceBrl: 0, pendingBrl: 0 },
            update: {},
          });

          await tx.wallet.update({
            where: { id: buyerWallet.id },
            data: { balanceBrl: { increment: refundAmount } },
          });

          await tx.walletTransaction.create({
            data: {
              walletId: buyerWallet.id,
              type: 'REFUND',
              amountBrl: new Decimal(refundAmount.toFixed(2)),
              referenceId: order.id,
              description: `Reembolso (vendedor não enviou): ${order.listing.title}`,
            },
          });

          // Re-activate the listing so it can be sold again
          await tx.listing.update({
            where: { id: order.listingId },
            data: { status: 'ACTIVE' },
          });
        });

        this.logger.log(`Auto-cancelled order ${order.id} — buyer refunded R$${refundAmount.toFixed(2)}`);
      } catch (err) {
        this.logger.error(
          `Failed to auto-cancel order ${order.id}: ${String(err).slice(0, 200)}`,
        );
      }
    }
  }
}
