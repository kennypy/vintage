import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/client';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CouponsService } from '../coupons/coupons.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ListingsService } from '../listings/listings.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { ShipOrderDto } from './dto/ship-order.dto';
import {
  BUYER_PROTECTION_FIXED_BRL,
  BUYER_PROTECTION_RATE,
  DISPUTE_WINDOW_DAYS,
} from '@vintage/shared';

@Injectable()
export class OrdersService {
  constructor(
    private prisma: PrismaService,
    private coupons: CouponsService,
    private notifications: NotificationsService,
    private listings: ListingsService,
  ) {}

  async create(buyerId: string, dto: CreateOrderDto) {
    // Idempotency check: if the buyer already submitted an order with the
    // same key, return the existing order instead of creating a duplicate.
    // The partial unique index on (buyerId, idempotencyKey) provides the
    // database-level guarantee; this check avoids an exception on the
    // happy retry path.
    if (dto.idempotencyKey) {
      const existing = await this.prisma.order.findFirst({
        where: { buyerId, idempotencyKey: dto.idempotencyKey },
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
      if (existing) return existing;
    }

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
    const subtotal = itemPrice + shippingCost + buyerProtectionFee;

    // Validate installments
    const installments = dto.installments ?? 1;
    if (installments > 1 && dto.paymentMethod !== 'CREDIT_CARD') {
      throw new BadRequestException('Parcelamento disponível apenas para cartão de crédito');
    }

    // Apply coupon if provided
    let couponId: string | undefined;
    let discountBrl = 0;
    let isFreeOrder = false;

    if (dto.couponCode) {
      const couponResult = await this.coupons.validate(dto.couponCode, subtotal);
      couponId = couponResult.couponId;
      discountBrl = couponResult.discountBrl;
      isFreeOrder = couponResult.discountPct === 100 || discountBrl >= subtotal;
    }

    const total = Math.max(0, subtotal - discountBrl);

    // Create order + mark listing SOLD + (re-)validate coupon usage under
    // Serializable isolation to prevent TOCTOU races on usedCount/maxUses.
    let order;
    try {
      order = await this.prisma.$transaction(
        async (tx) => {
          // Double-check listing is still active inside transaction.
          // Pull the fields needed to freeze an OrderListingSnapshot
          // in the same read so we never snapshot a listing whose
          // state drifted between this fetch and the snapshot write.
          const freshListing = await tx.listing.findUnique({
            where: { id: dto.listingId },
            include: {
              images: { orderBy: { position: 'asc' } },
              category: { select: { namePt: true } },
              brand: { select: { name: true } },
              seller: { select: { name: true } },
            },
          });

          if (!freshListing || freshListing.status !== 'ACTIVE') {
            throw new BadRequestException('Este anúncio já foi vendido');
          }

          // Re-validate coupon and increment usage atomically under Serializable
          if (couponId) {
            const coupon = await tx.coupon.findUnique({ where: { id: couponId } });
            if (!coupon || !coupon.isActive) {
              throw new BadRequestException('Cupom não está mais ativo');
            }
            if (coupon.expiresAt && coupon.expiresAt < new Date()) {
              throw new BadRequestException('Cupom expirado');
            }
            if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
              throw new ConflictException('Cupom atingiu o limite de usos');
            }
          }

          const createdOrder = await tx.order.create({
            data: {
              buyerId,
              sellerId: listing.sellerId,
              listingId: dto.listingId,
              // Free orders skip payment entirely — mark as PAID immediately
              status: isFreeOrder ? 'PAID' : 'PENDING',
              totalBrl: new Decimal(total.toFixed(2)),
              itemPriceBrl: listing.priceBrl,
              shippingCostBrl: new Decimal(shippingCost.toFixed(2)),
              buyerProtectionFeeBrl: new Decimal(buyerProtectionFee.toFixed(2)),
              discountBrl: discountBrl > 0 ? new Decimal(discountBrl.toFixed(2)) : undefined,
              couponId: couponId ?? undefined,
              shippingAddressId: dto.addressId,
              paymentMethod: isFreeOrder ? 'FREE' : dto.paymentMethod,
              installments: isFreeOrder ? 1 : installments,
              idempotencyKey: dto.idempotencyKey ?? undefined,
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

          // Freeze listing state onto the order. The snapshot is the
          // buyer's evidence for a potential dispute and must NOT
          // depend on the live Listing row (which the seller may
          // edit or soft-delete later). Row survives until the
          // order hits a terminal state (see releaseEscrow,
          // cancelByBuyer, autoCancelUnshippedOrders, resolve).
          await tx.orderListingSnapshot.create({
            data: {
              orderId: createdOrder.id,
              listingId: freshListing.id,
              sellerId: freshListing.sellerId,
              sellerName: freshListing.seller.name,
              title: freshListing.title,
              description: freshListing.description,
              categoryId: freshListing.categoryId,
              categoryName: freshListing.category.namePt,
              brandId: freshListing.brandId,
              brandName: freshListing.brand?.name ?? null,
              condition: freshListing.condition,
              size: freshListing.size,
              color: freshListing.color,
              priceBrl: freshListing.priceBrl,
              shippingWeightG: freshListing.shippingWeightG,
              imageUrls: freshListing.images.map((img) => img.url),
            },
          });

          // Increment coupon usage counter (inside tx, Serializable ensures
          // that any concurrent creator sees the new count on retry).
          if (couponId) {
            await tx.coupon.update({
              where: { id: couponId },
              data: { usedCount: { increment: 1 } },
            });
          }

          // Free orders are already PAID — hold funds in escrow immediately
          if (isFreeOrder) {
            const wallet = await tx.wallet.upsert({
              where: { userId: listing.sellerId },
              create: { userId: listing.sellerId, balanceBrl: 0, pendingBrl: 0 },
              update: {},
            });

            await tx.wallet.update({
              where: { id: wallet.id },
              data: { pendingBrl: { increment: itemPrice } },
            });

            await tx.walletTransaction.create({
              data: {
                walletId: wallet.id,
                type: 'ESCROW_HOLD',
                amountBrl: new Decimal(itemPrice.toFixed(2)),
                referenceId: createdOrder.id,
                description: `Venda em custódia: ${listing.title}`,
              },
            });
          }

          return createdOrder;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (err) {
      // Unique-constraint on idempotencyKey → fetch the existing order and return it
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002' &&
        dto.idempotencyKey
      ) {
        const existing = await this.prisma.order.findFirst({
          where: { buyerId, idempotencyKey: dto.idempotencyKey },
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
        if (existing) return existing;
      }
      throw err;
    }

    // Notify seller about new order (fire-and-forget)
    this.notifications
      .createNotification(
        order.sellerId,
        'order',
        'Nova venda!',
        `${order.buyer.name} comprou "${order.listing.title}"`,
        { orderId: order.id },
      )
      .catch(() => {});

    // Listing is now SOLD — remove it from search so other shoppers
    // don't see a purchased item in results.
    this.listings.syncSearchIndex(dto.listingId).catch(() => {});

    return order;
  }

  async findUserOrders(
    userId: string,
    role: 'buyer' | 'seller',
    page: number = 1,
    pageSize: number = 20,
  ) {
    page = Math.max(1, Number(page) || 1);
    pageSize = Math.min(100, Math.max(1, Number(pageSize) || 20));
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

  /**
   * Buyer-initiated cancellation of an unpaid order. Only allowed while the
   * order is still PENDING (not paid). Returns the listing to ACTIVE so the
   * seller can continue selling it. No refund logic is needed because no money
   * has moved; for PAID orders the dispute / cron flow handles refunds.
   */
  async cancelByBuyer(orderId: string, buyerId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });
    if (!order) {
      throw new NotFoundException('Pedido não encontrado');
    }
    if (order.buyerId !== buyerId) {
      throw new ForbiddenException('Apenas o comprador pode cancelar este pedido.');
    }
    if (order.status !== 'PENDING') {
      throw new BadRequestException(
        'Apenas pedidos aguardando pagamento podem ser cancelados. Abra uma disputa se já pagou.',
      );
    }

    // Wrap in an interactive transaction so we can re-read the listing state
    // and only reactivate it if it's still parked as SOLD for this order.
    // Prevents resurrecting a listing the seller has since DELETED or that
    // a concurrent flow has moved to another terminal state.
    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.order.update({
        where: { id: orderId },
        data: { status: 'CANCELLED' },
      });

      const listing = await tx.listing.findUnique({
        where: { id: order.listingId },
        select: { status: true },
      });
      if (listing && listing.status === 'SOLD') {
        await tx.listing.update({
          where: { id: order.listingId },
          data: { status: 'ACTIVE' },
        });
      }

      // PENDING order → no dispute possible; snapshot can go.
      await tx.orderListingSnapshot.deleteMany({ where: { orderId } });

      return next;
    });

    // Listing may have transitioned SOLD → ACTIVE inside the tx; re-add
    // it to search so buyers can find it again.
    this.listings.syncSearchIndex(order.listingId).catch(() => {});

    // Notify seller (fire-and-forget)
    this.notifications
      .createNotification(
        order.sellerId,
        'order',
        'Pedido cancelado',
        'O comprador cancelou o pedido antes do pagamento. O anúncio voltou a ficar ativo.',
        { orderId: order.id },
      )
      .catch(() => {});

    return updated;
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

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: 'SHIPPED',
        trackingCode: dto.trackingCode,
        carrier: dto.carrier as string as import('@prisma/client').Carrier,
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

    // Notify buyer that order shipped
    this.notifications
      .createNotification(
        updated.buyerId,
        'order',
        'Pedido enviado!',
        `Seu pedido "${(updated as any).listing?.title ?? 'item'}" foi enviado. Rastreio: ${dto.trackingCode}`,
        { orderId: updated.id, trackingCode: dto.trackingCode },
      )
      .catch(() => {});

    return updated;
  }

  /**
   * Marks a shipped order as delivered and sets the dispute deadline.
   * Called by tracking webhook or manually by the buyer/admin.
   */
  async markDelivered(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException('Pedido não encontrado');
    }

    if (order.status !== 'SHIPPED') {
      throw new BadRequestException('Pedido precisa estar enviado para marcar como entregue');
    }

    const now = new Date();
    const disputeDeadline = new Date(now);
    disputeDeadline.setDate(disputeDeadline.getDate() + DISPUTE_WINDOW_DAYS);

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: 'DELIVERED',
        deliveredAt: now,
        disputeDeadline,
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

    // Notify buyer about delivery
    this.notifications
      .createNotification(
        updated.buyerId,
        'order',
        'Pedido entregue!',
        `Seu pedido "${updated.listing.title}" foi entregue. Confirme o recebimento.`,
        { orderId: updated.id },
      )
      .catch(() => {});

    return updated;
  }

  /**
   * Buyer confirms receipt. Validates identity and delegates to releaseEscrow().
   */
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

    return this.releaseEscrow(orderId);
  }

  /**
   * Releases escrowed funds: moves itemPriceBrl from seller's pendingBrl
   * to balanceBrl, marks order as COMPLETED. Used by confirmReceipt(),
   * auto-confirm cron, and dispute resolution (seller wins).
   */
  async releaseEscrow(orderId: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.update({
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

      const itemAmount = Number(order.itemPriceBrl);

      const wallet = await tx.wallet.upsert({
        where: { userId: order.sellerId },
        create: { userId: order.sellerId, balanceBrl: 0, pendingBrl: 0 },
        update: {},
      });

      await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          pendingBrl: { decrement: itemAmount },
          balanceBrl: { increment: itemAmount },
        },
      });

      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'ESCROW_RELEASE',
          amountBrl: new Decimal(itemAmount.toFixed(2)),
          referenceId: orderId,
          description: `Fundos liberados: ${order.listing.title}`,
        },
      });

      // Terminal state — no further dispute possible. Purge the
      // frozen snapshot to reclaim storage. deleteMany (not delete)
      // because pre-migration orders won't have a snapshot row.
      await tx.orderListingSnapshot.deleteMany({ where: { orderId } });

      return order;
    });

    // Notify seller that funds were released
    this.notifications
      .createNotification(
        result.sellerId,
        'order',
        'Pagamento liberado!',
        `R$ ${Number(result.itemPriceBrl).toFixed(2).replace('.', ',')} da venda "${result.listing.title}" foi creditado na sua carteira.`,
        { orderId: result.id },
      )
      .catch(() => {});

    return result;
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
