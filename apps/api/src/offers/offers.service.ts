import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOfferDto } from './dto/create-offer.dto';
import {
  MIN_OFFER_PERCENTAGE,
  OFFER_EXPIRY_HOURS,
  containsProhibitedContent,
} from '@vintage/shared';

@Injectable()
export class OffersService {
  constructor(private prisma: PrismaService) {}

  async findUserOffers(
    userId: string,
    type: 'received' | 'sent',
    page: number,
    pageSize: number,
  ) {
    const where =
      type === 'received'
        ? { listing: { sellerId: userId } }
        : { buyerId: userId };

    const [items, total] = await Promise.all([
      this.prisma.offer.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          listing: {
            include: {
              images: { orderBy: { position: 'asc' }, take: 1 },
            },
          },
          buyer: { select: { id: true, name: true, avatarUrl: true } },
        },
      }),
      this.prisma.offer.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async create(buyerId: string, dto: CreateOfferDto) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: dto.listingId },
    });

    if (!listing) {
      throw new NotFoundException('Anúncio não encontrado');
    }

    if (listing.status !== 'ACTIVE') {
      throw new BadRequestException('Este anúncio não está disponível para ofertas');
    }

    // Catch pre-existing listings that contain prohibited content
    if (
      containsProhibitedContent(listing.title).matched ||
      containsProhibitedContent(listing.description).matched
    ) {
      throw new BadRequestException('Este anúncio não está disponível para ofertas');
    }

    if (listing.sellerId === buyerId) {
      throw new BadRequestException('Você não pode fazer uma oferta no seu próprio anúncio');
    }

    const minAmount = Number(listing.priceBrl) * MIN_OFFER_PERCENTAGE;
    if (dto.amountBrl < minAmount) {
      throw new BadRequestException(
        `O valor mínimo da oferta é R$ ${minAmount.toFixed(2)} (50% do preço do anúncio)`,
      );
    }

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + OFFER_EXPIRY_HOURS);

    return this.prisma.offer.create({
      data: {
        listingId: dto.listingId,
        buyerId,
        amountBrl: dto.amountBrl,
        status: 'PENDING',
        expiresAt,
      },
      include: {
        listing: {
          include: {
            images: { orderBy: { position: 'asc' }, take: 1 },
          },
        },
        buyer: { select: { id: true, name: true, avatarUrl: true } },
      },
    });
  }

  async accept(offerId: string, sellerId: string) {
    const offer = await this.prisma.offer.findUnique({
      where: { id: offerId },
      include: { listing: true },
    });

    if (!offer) {
      throw new NotFoundException('Oferta não encontrada');
    }

    if (offer.listing.sellerId !== sellerId) {
      throw new ForbiddenException('Apenas o vendedor pode aceitar esta oferta');
    }

    if (offer.status !== 'PENDING') {
      throw new BadRequestException('Esta oferta não está mais pendente');
    }

    if (offer.expiresAt < new Date()) {
      throw new BadRequestException('Esta oferta expirou');
    }

    // Block acceptance if the listing contains prohibited content
    if (
      containsProhibitedContent(offer.listing.title).matched ||
      containsProhibitedContent(offer.listing.description).matched
    ) {
      throw new BadRequestException('Este anúncio não está disponível para transações');
    }

    return this.prisma.offer.update({
      where: { id: offerId },
      data: { status: 'ACCEPTED' },
      include: {
        listing: {
          include: {
            images: { orderBy: { position: 'asc' }, take: 1 },
          },
        },
        buyer: { select: { id: true, name: true, avatarUrl: true } },
      },
    });
  }

  async reject(offerId: string, sellerId: string) {
    const offer = await this.prisma.offer.findUnique({
      where: { id: offerId },
      include: { listing: true },
    });

    if (!offer) {
      throw new NotFoundException('Oferta não encontrada');
    }

    if (offer.listing.sellerId !== sellerId) {
      throw new ForbiddenException('Apenas o vendedor pode rejeitar esta oferta');
    }

    if (offer.status !== 'PENDING') {
      throw new BadRequestException('Esta oferta não está mais pendente');
    }

    return this.prisma.offer.update({
      where: { id: offerId },
      data: { status: 'REJECTED' },
      include: {
        listing: {
          include: {
            images: { orderBy: { position: 'asc' }, take: 1 },
          },
        },
        buyer: { select: { id: true, name: true, avatarUrl: true } },
      },
    });
  }
}
