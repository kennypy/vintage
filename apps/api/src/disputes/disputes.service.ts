import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDisputeDto } from './dto/create-dispute.dto';
import { DISPUTE_WINDOW_DAYS } from '@vintage/shared';

@Injectable()
export class DisputesService {
  constructor(private prisma: PrismaService) {}

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

    return dispute;
  }

  /**
   * Lista disputas do usuário (como comprador do pedido relacionado).
   */
  async findUserDisputes(userId: string, page: number = 1, pageSize: number = 20) {
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
   * Resolve uma disputa (ação administrativa).
   */
  async resolve(disputeId: string, resolution: string, refund: boolean) {
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
      // Resolve the dispute
      const resolved = await tx.dispute.update({
        where: { id: disputeId },
        data: {
          status: 'RESOLVED',
          resolution,
        },
        include: {
          order: {
            include: {
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

      if (refund) {
        // Refund buyer: update order to REFUNDED
        await tx.order.update({
          where: { id: dispute.orderId },
          data: { status: 'REFUNDED' },
        });

        // Create wallet refund transaction for the buyer
        const buyerWallet = await tx.wallet.upsert({
          where: { userId: dispute.order.buyerId },
          create: {
            userId: dispute.order.buyerId,
            balanceBrl: 0,
            pendingBrl: 0,
          },
          update: {},
        });

        const refundAmount = Number(dispute.order.totalBrl);

        await tx.wallet.update({
          where: { id: buyerWallet.id },
          data: {
            balanceBrl: { increment: refundAmount },
          },
        });

        await tx.walletTransaction.create({
          data: {
            walletId: buyerWallet.id,
            type: 'CREDIT',
            amountBrl: new Decimal(refundAmount.toFixed(2)),
            referenceId: dispute.orderId,
            description: `Reembolso da disputa: ${dispute.order.listing.title}`,
          },
        });
      } else {
        // Resolve in seller's favor: complete order and release funds
        await tx.order.update({
          where: { id: dispute.orderId },
          data: {
            status: 'COMPLETED',
            confirmedAt: new Date(),
          },
        });

        // Credit seller wallet
        const sellerWallet = await tx.wallet.upsert({
          where: { userId: dispute.order.sellerId },
          create: {
            userId: dispute.order.sellerId,
            balanceBrl: 0,
            pendingBrl: 0,
          },
          update: {},
        });

        const itemAmount = Number(dispute.order.itemPriceBrl);

        await tx.wallet.update({
          where: { id: sellerWallet.id },
          data: {
            balanceBrl: { increment: itemAmount },
          },
        });

        await tx.walletTransaction.create({
          data: {
            walletId: sellerWallet.id,
            type: 'CREDIT',
            amountBrl: new Decimal(itemAmount.toFixed(2)),
            referenceId: dispute.orderId,
            description: `Venda concluída (disputa resolvida): ${dispute.order.listing.title}`,
          },
        });
      }

      return resolved;
    });

    return updatedDispute;
  }
}
