import { Injectable, NotFoundException, BadRequestException, ForbiddenException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class ReviewsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  async create(reviewerId: string, orderId: string, rating: number, comment?: string) {
    if (rating !== 1 && rating !== 5) {
      throw new BadRequestException('Avaliação deve ser 1 ou 5 estrelas');
    }

    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Pedido não encontrado');
    if (order.status !== 'COMPLETED') {
      throw new BadRequestException('Só é possível avaliar pedidos concluídos');
    }
    if (order.buyerId !== reviewerId) {
      throw new ForbiddenException('Apenas o comprador pode avaliar');
    }

    const existing = await this.prisma.review.findUnique({
      where: { orderId_reviewerId: { orderId, reviewerId } },
    });
    if (existing) throw new BadRequestException('Você já avaliou este pedido');

    const review = await this.prisma.review.create({
      data: {
        orderId,
        reviewerId,
        reviewedId: order.sellerId,
        rating,
        comment: comment ?? null,
      },
    });

    // Update seller rating average
    const stats = await this.prisma.review.aggregate({
      where: { reviewedId: order.sellerId },
      _avg: { rating: true },
      _count: { rating: true },
    });

    await this.prisma.user.update({
      where: { id: order.sellerId },
      data: {
        ratingAvg: stats._avg.rating ?? 0,
        ratingCount: stats._count.rating,
      },
    });

    // Notify the seller that they just got a new review.
    this.notifications
      .createNotification(
        order.sellerId,
        'REVIEW_RECEIVED',
        rating === 5
          ? 'Você recebeu uma avaliação positiva'
          : 'Você recebeu uma nova avaliação',
        comment?.slice(0, 140) ?? `${rating} ${rating === 1 ? 'estrela' : 'estrelas'}.`,
        { reviewId: review.id, orderId, rating: String(rating) },
        'reviews',
      )
      .catch(() => {
        /* never let notification failure break the review commit */
      });

    return review;
  }

  async getUserReviews(userId: string, page: number = 1, pageSize: number = 20) {
    page = Math.max(1, Number(page) || 1);
    pageSize = Math.min(100, Math.max(1, Number(pageSize) || 20));
    const skip = (page - 1) * pageSize;
    const [rows, total] = await Promise.all([
      this.prisma.review.findMany({
        where: { reviewedId: userId },
        include: {
          reviewer: { select: { id: true, name: true, avatarUrl: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.review.count({ where: { reviewedId: userId } }),
    ]);

    const items = rows.map(({ reviewer, ...r }) => ({
      ...r,
      reviewerId: reviewer.id,
      reviewerName: reviewer.name,
      reviewerAvatarUrl: reviewer.avatarUrl ?? undefined,
    }));

    return { items, total, page, totalPages: Math.ceil(total / pageSize) };
  }

  /**
   * Seller's public reply to a review they received.
   * Only the reviewed user (seller) may reply, and only once per review.
   */
  async replyToReview(reviewId: string, sellerId: string, reply: string) {
    if (!reply || reply.trim().length === 0) {
      throw new BadRequestException('Resposta não pode estar vazia');
    }
    if (reply.length > 500) {
      throw new BadRequestException('Resposta não pode ter mais de 500 caracteres');
    }

    const review = await this.prisma.review.findUnique({ where: { id: reviewId } });
    if (!review) throw new NotFoundException('Avaliação não encontrada');

    if (review.reviewedId !== sellerId) {
      throw new ForbiddenException('Somente o vendedor avaliado pode responder');
    }

    if (review.sellerReply) {
      throw new ConflictException('Você já respondeu esta avaliação');
    }

    return this.prisma.review.update({
      where: { id: reviewId },
      data: {
        sellerReply: reply.trim(),
        sellerReplyAt: new Date(),
      },
      include: {
        reviewer: { select: { id: true, name: true, avatarUrl: true } },
      },
    });
  }
}
