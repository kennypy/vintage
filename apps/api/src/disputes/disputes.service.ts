import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/client';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AnalyticsService, AnalyticsEvents } from '../analytics/analytics.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { PaymentsService } from '../payments/payments.service';
import { CreateDisputeDto } from './dto/create-dispute.dto';
import { DISPUTE_WINDOW_DAYS } from '@vintage/shared';

@Injectable()
export class DisputesService {
  private readonly logger = new Logger(DisputesService.name);

  constructor(
    private prisma: PrismaService,
    private analytics: AnalyticsService,
    private auditLog: AuditLogService,
    private payments: PaymentsService,
  ) {}

  /**
   * Abre uma disputa para um pedido entregue.
   */
  async create(buyerId: string, dto: CreateDisputeDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
      include: { dispute: true },
    });

    if (!order) {
      throw new NotFoundException('Pedido não encontrado');
    }

    if (order.buyerId !== buyerId) {
      throw new ForbiddenException('Apenas o comprador pode abrir uma disputa');
    }

    if (order.status !== 'DELIVERED') {
      throw new BadRequestException(
        'Disputas só podem ser abertas após a entrega do pedido',
      );
    }

    // Validate dispute window
    if (order.deliveredAt) {
      const windowEnd = new Date(order.deliveredAt);
      windowEnd.setDate(windowEnd.getDate() + DISPUTE_WINDOW_DAYS);

      if (new Date() > windowEnd) {
        throw new BadRequestException(
          `O prazo de ${DISPUTE_WINDOW_DAYS} dias para abrir disputa expirou`,
        );
      }
    }

    // Check no existing dispute
    if (order.dispute) {
      throw new ConflictException('Já existe uma disputa aberta para este pedido');
    }

    // Create dispute and update order status in a transaction
    const dispute = await this.prisma.$transaction(async (tx) => {
      const createdDispute = await tx.dispute.create({
        data: {
          orderId: dto.orderId,
          openedById: buyerId,
          reason: dto.reason,
          description: dto.description,
          status: 'OPEN',
        },
        include: {
          order: {
            include: {
              // listingSnapshot is the buyer's evidence of what they
              // bought — UI MUST prefer it when present. The live
              // listing is kept for link-back, but its current state
              // may have drifted (seller edits, soft-deletes).
              listingSnapshot: true,
              listing: {
                include: {
                  images: { orderBy: { position: 'asc' }, take: 1 },
                },
              },
            },
          },
          openedBy: { select: { id: true, name: true } },
        },
      });

      await tx.order.update({
        where: { id: dto.orderId },
        data: { status: 'DISPUTED' },
      });

      return createdDispute;
    });

    this.analytics.capture(buyerId, AnalyticsEvents.DISPUTE_OPENED, {
      orderId: dto.orderId,
      reason: dto.reason,
      hoursSinceDelivery: order.deliveredAt
        ? Math.round(
            (Date.now() - order.deliveredAt.getTime()) / (60 * 60 * 1000),
          )
        : null,
    });

    return dispute;
  }

  /**
   * Lista disputas do usuário (como comprador do pedido relacionado).
   */
  async findUserDisputes(userId: string, page: number = 1, pageSize: number = 20) {
    page = Math.max(1, Number(page) || 1);
    pageSize = Math.min(100, Math.max(1, Number(pageSize) || 20));
    const skip = (page - 1) * pageSize;

    const where = {
      order: { buyerId: userId },
    };

    const [items, total] = await Promise.all([
      this.prisma.dispute.findMany({
        where,
        include: {
          order: {
            include: {
              listingSnapshot: true,
              listing: {
                include: {
                  images: { orderBy: { position: 'asc' }, take: 1 },
                },
              },
              seller: { select: { id: true, name: true, avatarUrl: true } },
            },
          },
          openedBy: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.dispute.count({ where }),
    ]);

    return { items, total, page, pageSize, hasMore: skip + items.length < total };
  }

  /**
   * Admin: lista disputas em aberto (status OPEN) priorizando as mais
   * antigas. Usada pela tela /admin/disputes para triagem.
   */
  async findOpenDisputes(page: number = 1, pageSize: number = 20) {
    page = Math.max(1, Number(page) || 1);
    pageSize = Math.min(100, Math.max(1, Number(pageSize) || 20));
    const skip = (page - 1) * pageSize;

    const where = { status: 'OPEN' as const };

    const [items, total] = await Promise.all([
      this.prisma.dispute.findMany({
        where,
        include: {
          order: {
            include: {
              listingSnapshot: true,
              listing: {
                include: {
                  images: { orderBy: { position: 'asc' }, take: 1 },
                },
              },
              seller: { select: { id: true, name: true } },
              buyer: { select: { id: true, name: true } },
            },
          },
          openedBy: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'asc' }, // oldest first — FIFO triage
        skip,
        take: pageSize,
      }),
      this.prisma.dispute.count({ where }),
    ]);

    return { items, total, page, pageSize, hasMore: skip + items.length < total };
  }

  /**
   * Resolve uma disputa (ação administrativa).
   *
   * - refund=true  → buyer wins: refund buyer, reverse seller escrow hold
   * - refund=false → seller wins: release escrow to seller balance
   */
  async resolve(
    disputeId: string,
    resolution: string,
    refund: boolean,
    actorId: string | null = null,
  ) {
    const dispute = await this.prisma.dispute.findUnique({
      where: { id: disputeId },
      include: {
        order: {
          include: {
            listing: true,
          },
        },
      },
    });

    if (!dispute) {
      throw new NotFoundException('Disputa não encontrada');
    }

    if (dispute.status !== 'OPEN') {
      throw new BadRequestException('Esta disputa já foi resolvida');
    }

    const updatedDispute = await this.prisma.$transaction(async (tx) => {
      // Claim the dispute atomically. Two concurrent admin resolves
      // could both pass the outer `status !== 'OPEN'` check (that read
      // is OUTSIDE the tx), then both reach this point — the previous
      // code unconditionally updated to RESOLVED inside each tx and
      // credited the buyer's wallet twice. The conditional updateMany
      // collapses the race: the first writer wins (count=1), the
      // second writer sees count=0 and short-circuits with a
      // ConflictException — no refund, no escrow reversal, no
      // ledger duplication. Red-team finding R-01 (pen-test track 4).
      const claim = await tx.dispute.updateMany({
        where: { id: disputeId, status: 'OPEN' },
        data: { status: 'RESOLVED', resolution },
      });
      if (claim.count === 0) {
        throw new ConflictException(
          'Esta disputa já está sendo resolvida ou foi resolvida.',
        );
      }
      const resolved = await tx.dispute.findUniqueOrThrow({
        where: { id: disputeId },
        include: {
          order: {
            include: {
              // listingSnapshot is the buyer's evidence of what they
              // bought — UI MUST prefer it when present. The live
              // listing is kept for link-back, but its current state
              // may have drifted (seller edits, soft-deletes).
              listingSnapshot: true,
              listing: {
                include: {
                  images: { orderBy: { position: 'asc' }, take: 1 },
                },
              },
            },
          },
          openedBy: { select: { id: true, name: true } },
        },
      });

      const itemAmount = Number(dispute.order.itemPriceBrl);

      if (refund) {
        // Buyer wins: reverse the seller's escrow hold. The buyer's
        // side is handled OUTSIDE this transaction — we try Mercado
        // Pago's refund API first (so the buyer's original card /
        // PIX gets credited directly), and only fall back to a
        // platform wallet credit if MP refuses or the order had no
        // paymentId (free orders).
        await tx.order.update({
          where: { id: dispute.orderId },
          data: { status: 'REFUNDED' },
        });

        // Reverse the escrow hold on seller's wallet
        const sellerWallet = await tx.wallet.upsert({
          where: { userId: dispute.order.sellerId },
          create: {
            userId: dispute.order.sellerId,
            balanceBrl: 0,
            pendingBrl: 0,
          },
          update: {},
        });

        await tx.wallet.update({
          where: { id: sellerWallet.id },
          data: { pendingBrl: { decrement: itemAmount } },
        });

        await tx.walletTransaction.create({
          data: {
            walletId: sellerWallet.id,
            type: 'ESCROW_RELEASE',
            amountBrl: new Decimal((-itemAmount).toFixed(2)),
            referenceId: dispute.orderId,
            description: `Custódia revertida (disputa): ${dispute.order.listing.title}`,
          },
        });
      } else {
        // Seller wins: release escrow to seller balance
        await tx.order.update({
          where: { id: dispute.orderId },
          data: {
            status: 'COMPLETED',
            confirmedAt: new Date(),
          },
        });

        const sellerWallet = await tx.wallet.upsert({
          where: { userId: dispute.order.sellerId },
          create: {
            userId: dispute.order.sellerId,
            balanceBrl: 0,
            pendingBrl: 0,
          },
          update: {},
        });

        await tx.wallet.update({
          where: { id: sellerWallet.id },
          data: {
            pendingBrl: { decrement: itemAmount },
            balanceBrl: { increment: itemAmount },
          },
        });

        await tx.walletTransaction.create({
          data: {
            walletId: sellerWallet.id,
            type: 'ESCROW_RELEASE',
            amountBrl: new Decimal(itemAmount.toFixed(2)),
            referenceId: dispute.orderId,
            description: `Fundos liberados (disputa resolvida): ${dispute.order.listing.title}`,
          },
        });
      }

      // Dispute is RESOLVED — evidence is no longer needed on either
      // branch (refund=true → REFUNDED, refund=false → COMPLETED).
      // Purge the frozen snapshot.
      await tx.orderListingSnapshot.deleteMany({
        where: { orderId: dispute.orderId },
      });

      return resolved;
    });

    // Buyer-refund post-processing. MP refund is a network call —
    // must live OUTSIDE the DB transaction or it would hold row
    // locks for the RTT. Order of operations:
    //   1. Try MP refund(paymentId, totalBrl). Success → buyer's
    //      original payment method (card / PIX / boleto) gets
    //      credited directly by Mercado Pago. No platform wallet
    //      credit needed.
    //   2. On MP refund failure (provider outage, unknown paymentId,
    //      refund window expired, already-refunded, etc): fall back
    //      to a platform-side wallet credit so the buyer at least
    //      has liquidity. Also write a PaymentFlag so ops can chase
    //      the MP refund manually.
    //   3. Free orders + orders without a paymentId: straight to
    //      wallet credit (nothing to refund on MP).
    if (refund) {
      const refundAmount = Number(dispute.order.totalBrl);
      const paymentId = dispute.order.paymentId;
      let mpRefunded = false;

      if (paymentId) {
        try {
          await this.payments.refundPayment(paymentId, refundAmount);
          mpRefunded = true;
          this.logger.log(
            `Dispute ${disputeId}: MP refund issued for payment ${paymentId} (R$${refundAmount.toFixed(2)}).`,
          );
        } catch (err) {
          this.logger.warn(
            `Dispute ${disputeId}: MP refund failed for payment ${paymentId}: ${String(err).slice(0, 200)} — falling back to wallet credit.`,
          );
        }
      }

      if (!mpRefunded) {
        await this.applyWalletRefundFallback(
          dispute.order.buyerId,
          dispute.orderId,
          refundAmount,
          dispute.order.listing.title,
          paymentId,
        );
      }
    }

    // Audit trail — outside the tx so a transient audit-write failure
    // can't roll back the money movement. AuditLogService itself
    // swallows + logs on error for exactly this reason.
    await this.auditLog.record({
      actorId,
      action: refund ? 'dispute.resolve.refund_buyer' : 'dispute.resolve.release_seller',
      targetType: 'dispute',
      targetId: disputeId,
      metadata: {
        orderId: dispute.orderId,
        sellerId: dispute.order.sellerId,
        buyerId: dispute.order.buyerId,
        itemPriceBrl: Number(dispute.order.itemPriceBrl),
        totalBrl: Number(dispute.order.totalBrl),
      },
    });

    return updatedDispute;
  }

  /**
   * Wallet-credit fallback for the buyer-wins branch of resolve().
   * Runs when MP refund is unavailable (no paymentId / provider
   * rejected). Writes a PaymentFlag alongside so ops can manually
   * chase the card refund — the wallet credit buys the buyer
   * liquidity but doesn't remove the platform's exposure to a
   * chargeback.
   */
  private async applyWalletRefundFallback(
    buyerId: string,
    orderId: string,
    refundAmount: number,
    listingTitle: string,
    paymentId: string | null,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const buyerWallet = await tx.wallet.upsert({
        where: { userId: buyerId },
        create: { userId: buyerId, balanceBrl: 0, pendingBrl: 0 },
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
          referenceId: orderId,
          description: `Reembolso da disputa (crédito de carteira): ${listingTitle}`,
        },
      });
      // Only flag when there WAS a paymentId (i.e. MP refund was
      // attempted + failed). Free-orders with no paymentId are a
      // known branch, not an exception.
      if (paymentId) {
        await tx.paymentFlag.create({
          data: {
            orderId,
            paymentId,
            reason:
              'Dispute refund: MP refund API call failed; buyer credited to platform wallet as fallback. Ops must issue the card refund manually.',
          },
        });
      }
    });
  }
}
