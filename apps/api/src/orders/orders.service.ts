import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Decimal } from '@prisma/client/runtime/client';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CouponsService } from '../coupons/coupons.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ListingsService } from '../listings/listings.service';
import { FraudService } from '../fraud/fraud.service';
import { AnalyticsService, AnalyticsEvents } from '../analytics/analytics.service';
import { ReferralsService } from '../referrals/referrals.service';
import { SmsService } from '../sms/sms.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { ShipOrderDto } from './dto/ship-order.dto';
import {
  BUYER_PROTECTION_FIXED_BRL,
  BUYER_PROTECTION_RATE,
  DISPUTE_WINDOW_DAYS,
  ESCROW_HOLD_DAYS,
} from '@vintage/shared';
import { warnAndSwallow } from '../common/utils/fire-and-forget';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private prisma: PrismaService,
    private coupons: CouponsService,
    private notifications: NotificationsService,
    private listings: ListingsService,
    private fraud: FraudService,
    private analytics: AnalyticsService,
    private configService: ConfigService,
    private referrals: ReferralsService,
    private sms: SmsService,
  ) {}

  /**
   * Best-effort transactional WhatsApp (falls back to SMS) for a
   * shipping/order update. Never throws — the bell notification is the
   * source of truth; this channel is additive. Skips when the buyer
   * has no verified phone on file.
   */
  private async sendShippingAlert(userId: string, body: string): Promise<void> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { phone: true, pushEnabled: true },
      });
      if (!user?.phone) return;
      // Normalise to E.164 — User.phone is stored as digits after
      // batch 2 (55...) so we prepend the + ourselves.
      const digits = user.phone.replace(/\D/g, '');
      if (digits.length < 10) return;
      const to = digits.startsWith('55') ? `+${digits}` : `+55${digits}`;
      if (!SmsService.isValidE164(to)) return;
      await this.sms.sendWhatsapp(to, body);
    } catch {
      // never let transport failure break the order flow
    }
  }

  private getEscrowHoldDays(): number {
    const raw = this.configService.get<string | number>('ESCROW_HOLD_DAYS');
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : ESCROW_HOLD_DAYS;
  }

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

    // Fraud velocity check — runs before any payment setup so a
    // flagged buyer doesn't tie up MP's idempotency space. FLAG
    // allows the purchase through with a queued flag; BLOCK refuses.
    const fraudDecision = await this.fraud.evaluatePurchase(buyerId);
    if (fraudDecision.action === 'BLOCK') {
      throw new ForbiddenException(
        'Seu pedido foi bloqueado por nossa proteção contra fraude. Entre em contato com o suporte.',
      );
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
        'orders',
      )
      .catch(warnAndSwallow(this.logger, 'order.side-effect'));

    // Listing is now SOLD — remove it from search so other shoppers
    // don't see a purchased item in results.
    this.listings.syncSearchIndex(dto.listingId).catch(warnAndSwallow(this.logger, 'order.side-effect'));

    this.analytics.capture(buyerId, AnalyticsEvents.ORDER_CREATED, {
      orderId: order.id,
      listingId: order.listingId,
      sellerId: order.sellerId,
      totalBrl: Number(order.totalBrl),
      itemPriceBrl: Number(order.itemPriceBrl),
      paymentMethod: order.paymentMethod,
      isFreeOrder,
      usedCoupon: Boolean(order.couponId),
    });
    if (isFreeOrder) {
      // Coupon-100% orders are paid at creation, so fire the
      // order_paid signal now to keep funnels consistent.
      this.analytics.capture(buyerId, AnalyticsEvents.ORDER_PAID, {
        orderId: order.id,
        itemPriceBrl: Number(order.itemPriceBrl),
        paymentMethod: 'FREE',
      });
    }

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
      // Cancel is only allowed for PENDING orders (checked outside
      // the tx). Two concurrent cancels on the same order must not
      // both reactivate the listing — claim atomically.
      const claim = await tx.order.updateMany({
        where: { id: orderId, status: 'PENDING' },
        data: { status: 'CANCELLED' },
      });
      if (claim.count === 0) {
        throw new ConflictException(
          'Este pedido já foi atualizado por outra ação.',
        );
      }
      const next = await tx.order.findUniqueOrThrow({ where: { id: orderId } });

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
    this.listings.syncSearchIndex(order.listingId).catch(warnAndSwallow(this.logger, 'order.side-effect'));

    // Notify seller (fire-and-forget)
    this.notifications
      .createNotification(
        order.sellerId,
        'order',
        'Pedido cancelado',
        'O comprador cancelou o pedido antes do pagamento. O anúncio voltou a ficar ativo.',
        { orderId: order.id },
        'orders',
      )
      .catch(warnAndSwallow(this.logger, 'order.side-effect'));

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

    // Claim PAID → SHIPPED. Two concurrent markShipped requests
    // otherwise overwrite each other's trackingCode/carrier fields.
    const claim = await this.prisma.order.updateMany({
      where: { id: orderId, status: 'PAID' },
      data: {
        status: 'SHIPPED',
        trackingCode: dto.trackingCode,
        carrier: dto.carrier,
        shippedAt: new Date(),
      },
    });
    if (claim.count === 0) {
      throw new ConflictException(
        'Este pedido já foi atualizado por outra ação.',
      );
    }
    const updated = await this.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
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
        `Seu pedido "${updated.listing.title}" foi enviado. Rastreio: ${dto.trackingCode}`,
        { orderId: updated.id, trackingCode: dto.trackingCode },
        'orders',
      )
      .catch(warnAndSwallow(this.logger, 'order.side-effect'));

    // WhatsApp-first shipping alert. Fire-and-forget — the bell
    // notification above is the source of truth; WhatsApp is an
    // additional channel BR users expect for logistics updates.
    this.sendShippingAlert(
      updated.buyerId,
      `Vintage.br: seu pedido "${updated.listing.title}" foi enviado. Código de rastreio: ${dto.trackingCode}`,
    ).catch(warnAndSwallow(this.logger, 'order.side-effect'));

    return updated;
  }

  /**
   * Marks a shipped order as delivered and sets the dispute deadline.
   * Called by tracking webhook or manually by the buyer/admin.
   */
  async markDelivered(orderId: string, userId: string) {
    // Only buyer or seller can flip DELIVERED. The previous version
    // accepted any authenticated user — a bystander could mark someone
    // else's order delivered to start the dispute-window clock against
    // them (collapsing the buyer's window to claim item-not-received).
    return this.markDeliveredInternal(orderId, userId);
  }

  /**
   * Shared implementation. System callers (tracking-poller cron) pass
   * null for userId to skip the buyer/seller gate — the cron is already
   * an authoritative actor and has no user context. HTTP callers pass
   * the authenticated user id so the gate runs.
   */
  async markDeliveredInternal(orderId: string, userId: string | null) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException('Pedido não encontrado');
    }

    if (userId !== null && order.buyerId !== userId && order.sellerId !== userId) {
      throw new ForbiddenException(
        'Apenas comprador ou vendedor podem marcar este pedido como entregue.',
      );
    }

    if (order.status !== 'SHIPPED') {
      throw new BadRequestException('Pedido precisa estar enviado para marcar como entregue');
    }

    const now = new Date();
    const disputeDeadline = new Date(now);
    disputeDeadline.setDate(disputeDeadline.getDate() + DISPUTE_WINDOW_DAYS);

    // SHIPPED → DELIVERED race: buyer clicks "marcar como entregue"
    // and the tracking-poller concurrently fires, or two parallel
    // buyer requests. Unconditional update used to re-stamp
    // deliveredAt and reset disputeDeadline on the second call. The
    // claim silences the no-op second call instead of bumping state.
    const claim = await this.prisma.order.updateMany({
      where: { id: orderId, status: 'SHIPPED' },
      data: {
        status: 'DELIVERED',
        deliveredAt: now,
        disputeDeadline,
      },
    });
    if (claim.count === 0) {
      throw new ConflictException(
        'Este pedido já foi atualizado por outra ação.',
      );
    }
    const updated = await this.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
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
        'orders',
      )
      .catch(warnAndSwallow(this.logger, 'order.side-effect'));

    // WhatsApp delivery alert.
    this.sendShippingAlert(
      updated.buyerId,
      `Vintage.br: seu pedido "${updated.listing.title}" foi entregue! Confirme o recebimento no app.`,
    ).catch(warnAndSwallow(this.logger, 'order.side-effect'));

    this.analytics.capture(updated.buyerId, AnalyticsEvents.ORDER_DELIVERED, {
      orderId: updated.id,
      sellerId: updated.sellerId,
      transitDays:
        updated.shippedAt
          ? Math.round(
              (now.getTime() - updated.shippedAt.getTime()) /
                (24 * 60 * 60 * 1000),
            )
          : null,
    });

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

    return this.enterHold(orderId);
  }

  /**
   * Transitions a confirmed order into the escrow hold window. Funds
   * STAY in the seller's pendingBrl — they do not move to balanceBrl
   * until finalizeEscrow fires (via the releaseHeldEscrow cron). The
   * buyer can still open a dispute or request a return during the hold.
   *
   * Callers: confirmReceipt (buyer), autoConfirmOrders cron.
   */
  async enterHold(orderId: string) {
    const holdDays = this.getEscrowHoldDays();
    const now = new Date();
    const releasesAt = new Date(now);
    releasesAt.setDate(releasesAt.getDate() + holdDays);

    // Claim-gate: buyer double-clicks confirmReceipt, or cron +
    // admin both trigger hold entry, must NOT double-set
    // escrowReleasesAt (which would reset the release timer) or
    // double-fire the seller notification below. Only DELIVERED
    // orders can transition to HELD.
    const claim = await this.prisma.order.updateMany({
      where: { id: orderId, status: 'DELIVERED' },
      data: {
        status: 'HELD',
        confirmedAt: now,
        escrowReleasesAt: releasesAt,
      },
    });
    if (claim.count === 0) {
      throw new BadRequestException(
        'Pedido já foi processado por outra ação.',
      );
    }
    const result = await this.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
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

    // Notify seller — recebimento confirmado, funds still in hold
    this.notifications
      .createNotification(
        result.sellerId,
        'order',
        'Recebimento confirmado!',
        `O comprador confirmou o recebimento de "${result.listing.title}". Os fundos serão liberados em ${holdDays} dia(s).`,
        { orderId: result.id, escrowReleasesAt: releasesAt.toISOString() },
        'orders',
      )
      .catch(warnAndSwallow(this.logger, 'order.side-effect'));

    // Zero-day hold: finalize immediately. Keeps ops override simple
    // (ESCROW_HOLD_DAYS=0 is equivalent to "no hold").
    if (holdDays === 0) {
      return this.finalizeEscrow(orderId);
    }

    return result;
  }

  /**
   * Moves itemPriceBrl from seller's pendingBrl to balanceBrl and
   * transitions the order to COMPLETED. Called only after the escrow
   * hold window elapses (via releaseHeldEscrow cron) or when an admin
   * force-releases from /admin/orders.
   */
  async finalizeEscrow(orderId: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      // MONEY-CRITICAL claim: finalizeEscrow has three callers — the
      // releaseHeldEscrow cron, the enterHold zero-day path, and the
      // admin force-release button. An admin clicking twice, or the
      // cron firing while an admin fires manually, used to land on
      // unconditional update + wallet move → seller wallet credited
      // TWICE out of the same escrow hold. Claim-gate on status='HELD'
      // (the only legal entry state; confirmReceipt moves DELIVERED→
      // HELD via enterHold BEFORE calling this) so the race loser
      // returns a stale-but-valid row and does nothing.
      const claim = await tx.order.updateMany({
        where: { id: orderId, status: 'HELD' },
        data: {
          status: 'COMPLETED',
          confirmedAt: new Date(),
          escrowReleasesAt: null,
        },
      });
      if (claim.count === 0) {
        // Another actor already released this escrow. Return the
        // current row so callers that want the shape can still render
        // a sane response; they MUST NOT move money based on this
        // return value — the wallet mutation below is skipped.
        return tx.order.findUniqueOrThrow({
          where: { id: orderId },
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
      const order = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
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
        'orders',
      )
      .catch(warnAndSwallow(this.logger, 'order.side-effect'));

    // Referral reward fires on the buyer's first completed order.
    // creditIfEligible is a no-op for everyone else (no Referral row,
    // or reward already credited). Fire-and-forget — a referral
    // credit failure must not roll back the escrow release.
    this.referrals.creditIfEligible(result.buyerId).catch(warnAndSwallow(this.logger, 'order.side-effect'));

    return result;
  }

  /**
   * Back-compat shim. Pre-HELD callers (DisputesService seller-wins
   * branch) expect a single call that moves funds to balance and
   * completes the order in one step, bypassing the hold window (the
   * dispute resolution IS the settlement — no extra buffer needed).
   */
  async releaseEscrow(orderId: string) {
    return this.finalizeEscrow(orderId);
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
