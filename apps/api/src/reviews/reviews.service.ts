import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReviewsService {
  constructor(private prisma: PrismaService) {}

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

    return review;
  }

  async getUserReviews(userId: string, page: number = 1, pageSize: number = 20) {
    const skip = (page - 1) * pageSize;
    const [items, total] = await Promise.all([
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

    return { items, total, page, pageSize, hasMore: skip + items.length < total };
  }
}
