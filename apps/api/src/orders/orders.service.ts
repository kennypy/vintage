import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { ShipOrderDto } from './dto/ship-order.dto';
import {
  BUYER_PROTECTION_FIXED_BRL,
  BUYER_PROTECTION_RATE,
} from '@vintage/shared';

@Injectable()
export class OrdersService {
  constructor(private prisma: PrismaService) {}

  async create(buyerId: string, dto: CreateOrderDto) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: dto.listingId },
      include: { seller: { select: { id: true } } },
    });

    if (!listing) {
      throw new NotFoundException('Anúncio não encontrado');
    }

    if (listing.status !== 'ACTIVE') {
      throw new BadRequestException('Este anúncio não está disponível para compra');
    }

    if (listing.sellerId === buyerId) {
      throw new BadRequestException('Você não pode comprar seu próprio anúncio');
    }

    // Validate address belongs to buyer
    const address = await this.prisma.address.findUnique({
      where: { id: dto.addressId },
    });

    if (!address || address.userId !== buyerId) {
      throw new BadRequestException('Endereço de entrega inválido');
    }

    // Calculate totals
    const itemPrice = Number(listing.priceBrl);
    const shippingCost = this.calculateShipping(listing.shippingWeightG);
    const buyerProtectionFee =
      BUYER_PROTECTION_FIXED_BRL + itemPrice * BUYER_PROTECTION_RATE;
    const total = itemPrice + shippingCost + buyerProtectionFee;

    // Validate installments
    const installments = dto.installments ?? 1;
    if (installments > 1 && dto.paymentMethod !== 'CREDIT_CARD') {
      throw new BadRequestException('Parcelamento disponível apenas para cartão de crédito');
    }

    // Create order and mark listing as SOLD in a transaction
    const order = await this.prisma.$transaction(async (tx) => {
      // Double-check listing is still active inside transaction
      const freshListing = await tx.listing.findUnique({
        where: { id: dto.listingId },
      });

      if (!freshListing || freshListing.status !== 'ACTIVE') {
        throw new BadRequestException('Este anúncio já foi vendido');
      }

      const createdOrder = await tx.order.create({
        data: {
          buyerId,
          sellerId: listing.sellerId,
          listingId: dto.listingId,
          status: 'PENDING',
          totalBrl: new Decimal(total.toFixed(2)),
          itemPriceBrl: listing.priceBrl,
          shippingCostBrl: new Decimal(shippingCost.toFixed(2)),
          buyerProtectionFeeBrl: new Decimal(buyerProtectionFee.toFixed(2)),
          paymentMethod: dto.paymentMethod,
          installments,
        },
        include: {
          listing: {
            include: {
              images: { orderBy: { position: 'asc' }, take: 1 },
            },
          },
          buyer: { select: { id: true, name: true } },
          seller: { select: { id: true, name: true } },
        },
      });

      await tx.listing.update({
        where: { id: dto.listingId },
        data: { status: 'SOLD' },
      });

      return createdOrder;
    });

    return order;
  }

  async findUserOrders(
    userId: string,
    role: 'buyer' | 'seller',
    page: number = 1,
    pageSize: number = 20,
  ) {
    const skip = (page - 1) * pageSize;
    const where = role === 'buyer' ? { buyerId: userId } : { sellerId: userId };

    const [items, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: {
          listing: {
            include: {
              images: { orderBy: { position: 'asc' }, take: 1 },
            },
          },
          buyer: { select: { id: true, name: true, avatarUrl: true } },
          seller: { select: { id: true, name: true, avatarUrl: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.order.count({ where }),
    ]);

    return { items, total, page, pageSize, hasMore: skip + items.length < total };
  }

  async findOne(orderId: string, userId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        listing: {
          include: {
            images: { orderBy: { position: 'asc' } },
            category: true,
            brand: true,
          },
        },
        buyer: {
          select: { id: true, name: true, avatarUrl: true, verified: true },
        },
        seller: {
          select: { id: true, name: true, avatarUrl: true, verified: true },
        },
        dispute: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Pedido não encontrado');
    }

    if (order.buyerId !== userId && order.sellerId !== userId) {
      throw new ForbiddenException('Você não tem acesso a este pedido');
    }

    return order;
  }

  async markShipped(orderId: string, sellerId: string, dto: ShipOrderDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException('Pedido não encontrado');
    }

    if (order.sellerId !== sellerId) {
      throw new ForbiddenException('Apenas o vendedor pode marcar como enviado');
    }

    if (order.status !== 'PAID') {
      throw new BadRequestException('Pedido precisa estar pago para ser enviado');
    }

    return this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: 'SHIPPED',
        trackingCode: dto.trackingCode,
        carrier: dto.carrier,
        shippedAt: new Date(),
      },
      include: {
        listing: {
          include: {
            images: { orderBy: { position: 'asc' }, take: 1 },
          },
        },
        buyer: { select: { id: true, name: true } },
        seller: { select: { id: true, name: true } },
      },
    });
  }

  async confirmReceipt(orderId: string, buyerId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException('Pedido não encontrado');
    }

    if (order.buyerId !== buyerId) {
      throw new ForbiddenException('Apenas o comprador pode confirmar o recebimento');
    }

    if (order.status !== 'SHIPPED' && order.status !== 'DELIVERED') {
      throw new BadRequestException('Pedido precisa estar enviado para confirmar recebimento');
    }

    // Confirm order and credit seller wallet in a transaction
    const updatedOrder = await this.prisma.$transaction(async (tx) => {
      const confirmed = await tx.order.update({
        where: { id: orderId },
        data: {
          status: 'COMPLETED',
          confirmedAt: new Date(),
        },
        include: {
          listing: {
            include: {
              images: { orderBy: { position: 'asc' }, take: 1 },
            },
          },
          buyer: { select: { id: true, name: true } },
          seller: { select: { id: true, name: true } },
        },
      });

      // Credit seller wallet
      const itemAmount = Number(order.itemPriceBrl);

      // Ensure seller has a wallet
      const wallet = await tx.wallet.upsert({
        where: { userId: order.sellerId },
        create: { userId: order.sellerId, balanceBrl: 0, pendingBrl: 0 },
        update: {},
      });

      await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          balanceBrl: { increment: itemAmount },
        },
      });

      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'CREDIT',
          amountBrl: new Decimal(itemAmount.toFixed(2)),
          referenceId: orderId,
          description: `Venda do anúncio: ${confirmed.listing.title}`,
        },
      });

      return confirmed;
    });

    return updatedOrder;
  }

  /**
   * Simple shipping cost calculation based on weight.
   * In production this would call Correios/Jadlog APIs.
   */
  private calculateShipping(weightG: number): number {
    if (weightG <= 300) return 15.9;
    if (weightG <= 1000) return 22.5;
    if (weightG <= 5000) return 35.0;
    return 55.0;
  }
}
