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
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ShippingService } from '../shipping/shipping.service';
import { PaymentsService } from '../payments/payments.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { CreateReturnDto } from './dto/create-return.dto';
import { ApproveReturnDto, InspectReturnDto, RejectReturnDto } from './dto/approve-return.dto';
import { RETURN_WINDOW_DAYS } from '@vintage/shared';

/**
 * Buyer-initiated return flow. Distinct from Dispute: returns are a
 * collaborative refund path; disputes are adversarial. A rejected or
 * timed-out return auto-escalates into a Dispute so the buyer is
 * never stuck.
 *
 * State machine (see schema Return model for details):
 *   REQUESTED → APPROVED → SHIPPED → RECEIVED → REFUNDED (happy path)
 *   REQUESTED → REJECTED → (auto-creates Dispute)
 *   RECEIVED  → (seller inspects and rejects) → DISPUTED
 */
@Injectable()
export class ReturnsService {
  private readonly logger = new Logger(ReturnsService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private shipping: ShippingService,
    private payments: PaymentsService,
    private auditLog: AuditLogService,
    private configService: ConfigService,
  ) {}

  private getReturnWindowDays(): number {
    const raw = this.configService.get<string | number>('RETURN_WINDOW_DAYS');
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : RETURN_WINDOW_DAYS;
  }

  /**
   * Buyer opens a return. Order must be DELIVERED / HELD / COMPLETED
   * AND within the return window (measured from deliveredAt). Exactly
   * ONE active return per order (schema @@unique + runtime check).
   */
  async create(buyerId: string, dto: CreateReturnDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
      include: { returnRequest: true, dispute: true, listing: { select: { title: true } } },
    });
    if (!order) {
      throw new NotFoundException('Pedido não encontrado');
    }
    if (order.buyerId !== buyerId) {
      throw new ForbiddenException('Apenas o comprador pode solicitar devolução');
    }
    if (order.returnRequest) {
      throw new ConflictException('Já existe uma solicitação de devolução para este pedido');
    }
    if (order.dispute) {
      throw new ConflictException(
        'Já existe uma disputa em andamento para este pedido. Devoluções não podem ser abertas após abertura de disputa.',
      );
    }
    if (!['DELIVERED', 'HELD', 'COMPLETED'].includes(order.status)) {
      throw new BadRequestException(
        'Devoluções só podem ser solicitadas após a entrega do pedido',
      );
    }
    if (!order.deliveredAt) {
      throw new BadRequestException('Data de entrega não registrada para este pedido');
    }

    const windowDays = this.getReturnWindowDays();
    const windowEnd = new Date(order.deliveredAt);
    windowEnd.setDate(windowEnd.getDate() + windowDays);
    if (new Date() > windowEnd) {
      throw new BadRequestException(
        `O prazo de ${windowDays} dias para solicitar devolução expirou`,
      );
    }

    const created = await this.prisma.orderReturn.create({
      data: {
        orderId: dto.orderId,
        requestedById: buyerId,
        status: 'REQUESTED',
        reason: dto.reason,
        description: dto.description,
      },
    });

    this.notifications
      .createNotification(
        order.sellerId,
        'return',
        'Nova solicitação de devolução',
        `O comprador solicitou devolução de "${order.listing.title}".`,
        { returnId: created.id, orderId: dto.orderId },
        'orders',
      )
      .catch(() => {});

    return created;
  }

  /**
   * Seller approves the return. Triggers label generation against the
   * existing ShippingService; addresses are swapped (buyer → seller).
   * If label generation fails we still mark APPROVED — the seller can
   * regenerate from the UI (ops-friendly) rather than blocking the whole
   * flow on a carrier outage.
   */
  async approve(returnId: string, sellerId: string, dto: ApproveReturnDto) {
    const ret = await this.prisma.orderReturn.findUnique({
      where: { id: returnId },
      include: {
        order: {
          include: {
            listing: { select: { title: true, shippingWeightG: true, sellerId: true } },
            shippingAddress: true,
            seller: { include: { addresses: { where: { isDefault: true }, take: 1 } } },
          },
        },
      },
    });
    if (!ret) {
      throw new NotFoundException('Devolução não encontrada');
    }
    if (ret.order.sellerId !== sellerId) {
      throw new ForbiddenException('Apenas o vendedor pode aprovar esta devolução');
    }
    if (ret.status !== 'REQUESTED') {
      throw new BadRequestException('Esta devolução já foi processada');
    }

    const carrier = dto.carrier ?? 'CORREIOS';
    let labelUrl: string | null = null;
    let trackingCode: string | null = null;
    try {
      // Return label: buyer's address → seller's default address.
      const buyerAddr = ret.order.shippingAddress;
      const sellerAddr = ret.order.seller.addresses[0];
      if (buyerAddr && sellerAddr) {
        const from = `${buyerAddr.street}, ${buyerAddr.number} - ${buyerAddr.neighborhood}, ${buyerAddr.city}/${buyerAddr.state} ${buyerAddr.cep}`;
        const to = `${sellerAddr.street}, ${sellerAddr.number} - ${sellerAddr.neighborhood}, ${sellerAddr.city}/${sellerAddr.state} ${sellerAddr.cep}`;
        const label = await this.shipping.generateShippingLabel(
          ret.order.id,
          carrier,
          from,
          to,
          ret.order.listing.shippingWeightG,
          sellerId,
        );
        labelUrl = label.labelUrl;
        trackingCode = label.trackingCode;
      }
    } catch (err) {
      this.logger.warn(
        `Return label generation failed for ${returnId}: ${String(err).slice(0, 200)}`,
      );
    }

    // Claim atomically: a concurrent approve/reject by a second
    // tab/request could both pass the outer `status !== 'REQUESTED'`
    // check (read outside any tx) and both fire. updateMany gated on
    // status='REQUESTED' lets the first writer win and the second see
    // count=0.
    const claim = await this.prisma.orderReturn.updateMany({
      where: { id: returnId, status: 'REQUESTED' },
      data: {
        status: 'APPROVED',
        returnCarrier: carrier,
        returnLabelUrl: labelUrl,
        returnTrackingCode: trackingCode,
      },
    });
    if (claim.count === 0) {
      throw new ConflictException(
        'Esta devolução já foi atualizada por outra ação.',
      );
    }
    const updated = await this.prisma.orderReturn.findUniqueOrThrow({
      where: { id: returnId },
    });

    this.notifications
      .createNotification(
        ret.order.buyerId,
        'return',
        'Devolução aprovada',
        `O vendedor aprovou sua devolução de "${ret.order.listing.title}". Envie o item usando a etiqueta gerada.`,
        { returnId, orderId: ret.order.id, trackingCode },
        'orders',
      )
      .catch(() => {});

    return updated;
  }

  /**
   * Seller rejects the return. We escalate to a formal Dispute so ops
   * can mediate and the buyer isn't stuck — rejection alone never
   * closes the refund path.
   */
  async reject(returnId: string, sellerId: string, dto: RejectReturnDto) {
    const ret = await this.prisma.orderReturn.findUnique({
      where: { id: returnId },
      include: { order: { include: { listing: { select: { title: true } } } } },
    });
    if (!ret) {
      throw new NotFoundException('Devolução não encontrada');
    }
    if (ret.order.sellerId !== sellerId) {
      throw new ForbiddenException('Apenas o vendedor pode rejeitar esta devolução');
    }
    if (ret.status !== 'REQUESTED') {
      throw new BadRequestException('Esta devolução já foi processada');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const claim = await tx.orderReturn.updateMany({
        where: { id: returnId, status: 'REQUESTED' },
        data: {
          status: 'REJECTED',
          rejectionReason: dto.reason,
        },
      });
      if (claim.count === 0) {
        throw new ConflictException(
          'Esta devolução já foi atualizada por outra ação.',
        );
      }
      const updatedReturn = await tx.orderReturn.findUniqueOrThrow({
        where: { id: returnId },
      });

      // Escalate: create a Dispute row if one doesn't already exist.
      // The buyer opened the return (they are the dispute opener) and
      // the reason taxonomy matches.
      const existingDispute = await tx.dispute.findUnique({
        where: { orderId: ret.order.id },
      });
      if (!existingDispute) {
        await tx.dispute.create({
          data: {
            orderId: ret.order.id,
            openedById: ret.requestedById,
            reason: ret.reason,
            description: `Devolução rejeitada pelo vendedor: ${dto.reason}\n\nMotivo original: ${ret.description}`,
            status: 'OPEN',
          },
        });
        await tx.order.update({
          where: { id: ret.order.id },
          data: { status: 'DISPUTED' },
        });
      }

      return updatedReturn;
    });

    this.notifications
      .createNotification(
        ret.order.buyerId,
        'return',
        'Devolução recusada',
        `Sua devolução foi recusada e escalou para disputa. Nossa equipe vai mediar.`,
        { returnId, orderId: ret.order.id },
        'orders',
      )
      .catch(() => {});

    return updated;
  }

  /**
   * Seller inspects the returned item and approves the refund. Moves
   * escrow money back to buyer (wallet credit fallback — MP refund is
   * best-effort via PaymentsService).
   */
  async inspectApprove(returnId: string, sellerId: string, dto: InspectReturnDto) {
    const ret = await this.prisma.orderReturn.findUnique({
      where: { id: returnId },
      include: { order: { include: { listing: { select: { title: true } } } } },
    });
    if (!ret) {
      throw new NotFoundException('Devolução não encontrada');
    }
    if (ret.order.sellerId !== sellerId) {
      throw new ForbiddenException('Apenas o vendedor pode inspecionar esta devolução');
    }
    if (ret.status !== 'RECEIVED') {
      throw new BadRequestException(
        'Devolução precisa estar recebida pelo vendedor antes da inspeção',
      );
    }

    const refundAmount = Number(ret.order.totalBrl);
    const itemAmount = Number(ret.order.itemPriceBrl);

    await this.prisma.$transaction(async (tx) => {
      // Claim the RECEIVED return atomically before any money moves.
      // Two concurrent inspectApprove calls (e.g. seller clicks twice,
      // or seller + ops both act) used to both pass the outer status
      // check and both decrement/credit wallets — a double refund.
      const claim = await tx.orderReturn.updateMany({
        where: { id: returnId, status: 'RECEIVED' },
        data: { status: 'REFUNDED', inspectedAt: new Date() },
      });
      if (claim.count === 0) {
        throw new ConflictException(
          'Esta devolução já foi atualizada por outra ação.',
        );
      }

      await tx.order.update({
        where: { id: ret.order.id },
        data: { status: 'REFUNDED', escrowReleasesAt: null },
      });

      // Reverse seller's escrow hold.
      const sellerWallet = await tx.wallet.upsert({
        where: { userId: ret.order.sellerId },
        create: { userId: ret.order.sellerId, balanceBrl: 0, pendingBrl: 0 },
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
          referenceId: ret.order.id,
          description: `Custódia revertida (devolução): ${ret.order.listing.title}`,
        },
      });

      // Credit buyer wallet as fallback refund. MP refund is attempted
      // outside the tx below.
      const buyerWallet = await tx.wallet.upsert({
        where: { userId: ret.order.buyerId },
        create: { userId: ret.order.buyerId, balanceBrl: 0, pendingBrl: 0 },
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
          referenceId: ret.order.id,
          description: `Reembolso de devolução: ${ret.order.listing.title}`,
        },
      });

      await tx.orderListingSnapshot.deleteMany({
        where: { orderId: ret.order.id },
      });
    });

    // Attempt provider-side refund (best effort).
    if (ret.order.paymentId) {
      try {
        await this.payments.refundPayment(ret.order.paymentId, refundAmount);
      } catch (err) {
        this.logger.warn(
          `MP refund failed for return ${returnId}: ${String(err).slice(0, 200)}`,
        );
      }
    }

    await this.auditLog.record({
      actorId: sellerId,
      action: 'return.inspect.approve',
      targetType: 'return',
      targetId: returnId,
      metadata: {
        orderId: ret.order.id,
        buyerId: ret.order.buyerId,
        refundAmount,
        note: dto.note,
      },
    });

    this.notifications
      .createNotification(
        ret.order.buyerId,
        'return',
        'Reembolso processado',
        `O vendedor aprovou a devolução de "${ret.order.listing.title}". Valor creditado na sua carteira.`,
        { returnId, orderId: ret.order.id, refundAmount },
        'orders',
      )
      .catch(() => {});

    return this.prisma.orderReturn.findUnique({ where: { id: returnId } });
  }

  /**
   * Seller inspects and REJECTS — escalate to dispute for mediation.
   */
  async inspectReject(returnId: string, sellerId: string, dto: RejectReturnDto) {
    const ret = await this.prisma.orderReturn.findUnique({
      where: { id: returnId },
      include: { order: { include: { listing: { select: { title: true } } } } },
    });
    if (!ret) {
      throw new NotFoundException('Devolução não encontrada');
    }
    if (ret.order.sellerId !== sellerId) {
      throw new ForbiddenException('Apenas o vendedor pode inspecionar esta devolução');
    }
    if (ret.status !== 'RECEIVED') {
      throw new BadRequestException(
        'Devolução precisa estar recebida para inspecionar',
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const claim = await tx.orderReturn.updateMany({
        where: { id: returnId, status: 'RECEIVED' },
        data: {
          status: 'DISPUTED',
          rejectionReason: dto.reason,
          inspectedAt: new Date(),
        },
      });
      if (claim.count === 0) {
        throw new ConflictException(
          'Esta devolução já foi atualizada por outra ação.',
        );
      }
      const updatedReturn = await tx.orderReturn.findUniqueOrThrow({
        where: { id: returnId },
      });

      const existingDispute = await tx.dispute.findUnique({
        where: { orderId: ret.order.id },
      });
      if (!existingDispute) {
        await tx.dispute.create({
          data: {
            orderId: ret.order.id,
            openedById: ret.requestedById,
            reason: ret.reason,
            description: `Inspeção rejeitada pelo vendedor: ${dto.reason}\n\nMotivo original: ${ret.description}`,
            status: 'OPEN',
          },
        });
        await tx.order.update({
          where: { id: ret.order.id },
          data: { status: 'DISPUTED' },
        });
      }
      return updatedReturn;
    });

    this.notifications
      .createNotification(
        ret.order.buyerId,
        'return',
        'Inspeção rejeitada',
        `O vendedor recusou a inspeção da devolução. Caso escalado para disputa.`,
        { returnId, orderId: ret.order.id },
        'orders',
      )
      .catch(() => {});

    return updated;
  }

  /**
   * Called by TrackingPollerService when the return tracking code
   * reports 'delivered'. System caller (no userId) — advances status
   * from SHIPPED → RECEIVED and notifies seller to inspect.
   */
  async markReceivedByTracking(returnId: string) {
    const ret = await this.prisma.orderReturn.findUnique({
      where: { id: returnId },
      include: { order: { include: { listing: { select: { title: true, sellerId: true } } } } },
    });
    if (!ret) return;
    if (ret.status !== 'SHIPPED') return;

    // Tracking poller may fire twice for the same delivered event
    // (multiple carrier event polls or cron overlap). Gate on SHIPPED
    // so only the first transition emits a notification.
    const claim = await this.prisma.orderReturn.updateMany({
      where: { id: returnId, status: 'SHIPPED' },
      data: { status: 'RECEIVED', receivedAt: new Date() },
    });
    if (claim.count === 0) return;

    this.notifications
      .createNotification(
        ret.order.listing.sellerId,
        'return',
        'Item devolvido recebido',
        `A devolução de "${ret.order.listing.title}" chegou. Inspecione o item e aprove o reembolso.`,
        { returnId, orderId: ret.order.id },
        'orders',
      )
      .catch(() => {});
  }

  /**
   * Buyer marks the return shipped (lightweight — the tracking poller
   * will update to RECEIVED when the carrier confirms delivery).
   */
  async markShipped(returnId: string, buyerId: string) {
    const ret = await this.prisma.orderReturn.findUnique({
      where: { id: returnId },
      include: { order: { select: { buyerId: true } } },
    });
    if (!ret) {
      throw new NotFoundException('Devolução não encontrada');
    }
    if (ret.order.buyerId !== buyerId) {
      throw new ForbiddenException('Apenas o comprador pode marcar como enviado');
    }
    if (ret.status !== 'APPROVED') {
      throw new BadRequestException('Devolução precisa estar aprovada');
    }
    const claim = await this.prisma.orderReturn.updateMany({
      where: { id: returnId, status: 'APPROVED' },
      data: { status: 'SHIPPED', shippedAt: new Date() },
    });
    if (claim.count === 0) {
      throw new ConflictException(
        'Esta devolução já foi atualizada por outra ação.',
      );
    }
    return this.prisma.orderReturn.findUniqueOrThrow({ where: { id: returnId } });
  }

  async findOne(returnId: string, userId: string) {
    const ret = await this.prisma.orderReturn.findUnique({
      where: { id: returnId },
      include: {
        order: {
          include: {
            listing: { include: { images: { orderBy: { position: 'asc' }, take: 1 } } },
            buyer: { select: { id: true, name: true, avatarUrl: true } },
            seller: { select: { id: true, name: true, avatarUrl: true } },
          },
        },
      },
    });
    if (!ret) {
      throw new NotFoundException('Devolução não encontrada');
    }
    if (ret.order.buyerId !== userId && ret.order.sellerId !== userId) {
      throw new ForbiddenException('Acesso negado');
    }
    return ret;
  }

  async findUserReturns(userId: string, type: 'sent' | 'received', page = 1, pageSize = 20) {
    page = Math.max(1, Number(page) || 1);
    pageSize = Math.min(100, Math.max(1, Number(pageSize) || 20));
    const skip = (page - 1) * pageSize;
    const where =
      type === 'sent'
        ? { order: { buyerId: userId } }
        : { order: { sellerId: userId } };
    const [items, total] = await Promise.all([
      this.prisma.orderReturn.findMany({
        where,
        include: {
          order: {
            include: {
              listing: { include: { images: { orderBy: { position: 'asc' }, take: 1 } } },
              buyer: { select: { id: true, name: true, avatarUrl: true } },
              seller: { select: { id: true, name: true, avatarUrl: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.orderReturn.count({ where }),
    ]);
    return { items, total, page, pageSize, hasMore: skip + items.length < total };
  }
}
