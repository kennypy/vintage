import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  MEGAFONE_FREE_DAYS,
  BUMP_PRICE_BRL,
  BUMP_DURATION_DAYS,
  SPOTLIGHT_PRICE_BRL,
  SPOTLIGHT_DURATION_DAYS,
} from '@vintage/shared';

@Injectable()
export class PromotionsService {
  constructor(private prisma: PrismaService) {}

  async createMegafone(listingId: string, userId: string) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
    });

    if (!listing) {
      throw new NotFoundException('Anúncio não encontrado');
    }

    if (listing.sellerId !== userId) {
      throw new ForbiddenException('Você só pode promover seus próprios anúncios');
    }

    if (listing.status !== 'ACTIVE') {
      throw new BadRequestException('Apenas anúncios ativos podem ser promovidos');
    }

    // Check if listing already has an active megafone
    const existingPromo = await this.prisma.promotion.findFirst({
      where: {
        listingId,
        type: 'MEGAFONE',
        endsAt: { gt: new Date() },
      },
    });

    if (existingPromo) {
      throw new BadRequestException('Este anúncio já possui um megafone ativo');
    }

    const listingAgeDays = Math.floor(
      (Date.now() - listing.createdAt.getTime()) / (1000 * 60 * 60 * 24),
    );

    // Free for listings less than 7 days old
    if (listingAgeDays < MEGAFONE_FREE_DAYS) {
      const endsAt = new Date();
      endsAt.setDate(endsAt.getDate() + MEGAFONE_FREE_DAYS);

      const promotion = await this.prisma.promotion.create({
        data: {
          listingId,
          userId,
          type: 'MEGAFONE',
          endsAt,
          pricePaidBrl: new Decimal('0.00'),
          requiresDiscount: false,
        },
      });

      await this.prisma.listing.update({
        where: { id: listingId },
        data: { promotedUntil: endsAt },
      });

      return promotion;
    }

    // After 7 days, requires price reduction
    // Check if listing had a price reduction (compare current price with original)
    const endsAt = new Date();
    endsAt.setDate(endsAt.getDate() + MEGAFONE_FREE_DAYS);

    const promotion = await this.prisma.promotion.create({
      data: {
        listingId,
        userId,
        type: 'MEGAFONE',
        endsAt,
        pricePaidBrl: new Decimal('0.00'),
        requiresDiscount: true,
      },
    });

    await this.prisma.listing.update({
      where: { id: listingId },
      data: { promotedUntil: endsAt },
    });

    return promotion;
  }

  async createBump(listingId: string, userId: string) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
    });

    if (!listing) {
      throw new NotFoundException('Anúncio não encontrado');
    }

    if (listing.sellerId !== userId) {
      throw new ForbiddenException('Você só pode promover seus próprios anúncios');
    }

    if (listing.status !== 'ACTIVE') {
      throw new BadRequestException('Apenas anúncios ativos podem ser promovidos');
    }

    // Check if listing already has an active bump
    const existingPromo = await this.prisma.promotion.findFirst({
      where: {
        listingId,
        type: 'BUMP',
        endsAt: { gt: new Date() },
      },
    });

    if (existingPromo) {
      throw new BadRequestException('Este anúncio já possui um bump ativo');
    }

    // Deduct from wallet
    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) {
      throw new BadRequestException('Carteira não encontrada. Adicione saldo primeiro');
    }

    if (Number(wallet.balanceBrl) < BUMP_PRICE_BRL) {
      throw new BadRequestException(
        `Saldo insuficiente. Necessário R$${BUMP_PRICE_BRL.toFixed(2)}`,
      );
    }

    const endsAt = new Date();
    endsAt.setDate(endsAt.getDate() + BUMP_DURATION_DAYS);

    const promotion = await this.prisma.$transaction(async (tx) => {
      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balanceBrl: { decrement: BUMP_PRICE_BRL } },
      });

      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'DEBIT',
          amountBrl: new Decimal((-BUMP_PRICE_BRL).toFixed(2)),
          description: `Bump do anúncio: ${listing.title}`,
        },
      });

      const promo = await tx.promotion.create({
        data: {
          listingId,
          userId,
          type: 'BUMP',
          endsAt,
          pricePaidBrl: new Decimal(BUMP_PRICE_BRL.toFixed(2)),
        },
      });

      await tx.listing.update({
        where: { id: listingId },
        data: { promotedUntil: endsAt },
      });

      return promo;
    });

    return promotion;
  }

  async createSpotlight(userId: string) {
    // Check if user already has an active spotlight
    const existingSpotlight = await this.prisma.promotion.findFirst({
      where: {
        userId,
        type: 'SPOTLIGHT',
        endsAt: { gt: new Date() },
      },
    });

    if (existingSpotlight) {
      throw new BadRequestException('Você já possui um destaque ativo');
    }

    // Deduct from wallet
    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) {
      throw new BadRequestException('Carteira não encontrada. Adicione saldo primeiro');
    }

    if (Number(wallet.balanceBrl) < SPOTLIGHT_PRICE_BRL) {
      throw new BadRequestException(
        `Saldo insuficiente. Necessário R$${SPOTLIGHT_PRICE_BRL.toFixed(2)}`,
      );
    }

    const endsAt = new Date();
    endsAt.setDate(endsAt.getDate() + SPOTLIGHT_DURATION_DAYS);

    const promotion = await this.prisma.$transaction(async (tx) => {
      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balanceBrl: { decrement: SPOTLIGHT_PRICE_BRL } },
      });

      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'DEBIT',
          amountBrl: new Decimal((-SPOTLIGHT_PRICE_BRL).toFixed(2)),
          description: 'Destaque de closet (Spotlight)',
        },
      });

      // Promote all active user listings
      await tx.listing.updateMany({
        where: { sellerId: userId, status: 'ACTIVE' },
        data: { promotedUntil: endsAt },
      });

      const promo = await tx.promotion.create({
        data: {
          listingId: null,
          userId,
          type: 'SPOTLIGHT',
          endsAt,
          pricePaidBrl: new Decimal(SPOTLIGHT_PRICE_BRL.toFixed(2)),
        },
      });

      return promo;
    });

    return promotion;
  }

  async getActivePromotions(userId: string) {
    return this.prisma.promotion.findMany({
      where: {
        userId,
        endsAt: { gt: new Date() },
      },
      include: {
        listing: {
          include: {
            images: { orderBy: { position: 'asc' }, take: 1 },
          },
        },
      },
      orderBy: { endsAt: 'asc' },
    });
  }

  async getPromotionStats(promotionId: string, userId: string) {
    const promotion = await this.prisma.promotion.findUnique({
      where: { id: promotionId },
      include: { listing: true },
    });

    if (!promotion) {
      throw new NotFoundException('Promoção não encontrada');
    }

    if (promotion.userId !== userId) {
      throw new ForbiddenException('Você não tem acesso a esta promoção');
    }

    // Mock stats for now
    return {
      promotionId: promotion.id,
      type: promotion.type,
      startsAt: promotion.startsAt,
      endsAt: promotion.endsAt,
      views: Math.floor(Math.random() * 500) + 50,
      clicks: Math.floor(Math.random() * 100) + 10,
      favorites: Math.floor(Math.random() * 20) + 2,
    };
  }
}
