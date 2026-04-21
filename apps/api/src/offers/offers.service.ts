import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateOfferDto } from './dto/create-offer.dto';
import {
  MIN_OFFER_PERCENTAGE,
  OFFER_EXPIRY_HOURS,
  containsProhibitedContent,
} from '@vintage/shared';

@Injectable()
export class OffersService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  async findUserOffers(
    userId: string,
    type: 'received' | 'sent',
    page: number,
    pageSize: number,
  ) {
    page = Math.max(1, Number(page) || 1);
    pageSize = Math.min(100, Math.max(1, Number(pageSize) || 20));
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

    // Reject if buyer is blocked by (or has blocked) the seller, or either side is banned/deleted
    const [participants, block] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: [buyerId, listing.sellerId] } },
        select: { id: true, isBanned: true, deletedAt: true },
      }),
      this.prisma.userBlock.findFirst({
        where: {
          OR: [
            { blockerId: buyerId, blockedId: listing.sellerId },
            { blockerId: listing.sellerId, blockedId: buyerId },
          ],
        },
      }),
    ]);
    if (participants.some((u) => u.isBanned || u.deletedAt) || block) {
      throw new ForbiddenException('Não é possível fazer oferta neste anúncio.');
    }

    const minAmount = Number(listing.priceBrl) * MIN_OFFER_PERCENTAGE;
    if (dto.amountBrl < minAmount) {
      throw new BadRequestException(
        `O valor mínimo da oferta é R$ ${minAmount.toFixed(2)} (50% do preço do anúncio)`,
      );
    }

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + OFFER_EXPIRY_HOURS);

    const offer = await this.prisma.offer.create({
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

    // Notify the seller — they decide whether to accept/reject. Fire-and-
    // forget so a notification outage doesn't rollback the offer.
    this.notifications
      .createNotification(
        listing.sellerId,
        'OFFER_RECEIVED',
        'Você recebeu uma nova oferta',
        `${offer.buyer?.name ?? 'Alguém'} ofereceu R$ ${Number(dto.amountBrl).toFixed(2)} por "${listing.title}".`,
        { offerId: offer.id, listingId: listing.id, buyerId },
        'offers',
      )
      .catch(() => {
        /* never let notification failure break an offer create */
      });

    return offer;
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

    // Use <= so an offer whose expiresAt lands at exactly `now` is
    // refused. With strict < the buyer could race accept vs. expire
    // on the millisecond boundary.
    if (offer.expiresAt <= new Date()) {
      throw new BadRequestException('Esta oferta expirou');
    }

    // Block acceptance if the listing contains prohibited content
    if (
      containsProhibitedContent(offer.listing.title).matched ||
      containsProhibitedContent(offer.listing.description).matched
    ) {
      throw new BadRequestException('Este anúncio não está disponível para transações');
    }

    const updated = await this.prisma.offer.update({
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

    // Notify the buyer — their offer was accepted, they're expected to
    // complete checkout now.
    this.notifications
      .createNotification(
        offer.buyerId,
        'OFFER_ACCEPTED',
        'Sua oferta foi aceita!',
        `O vendedor aceitou sua oferta de R$ ${Number(offer.amountBrl).toFixed(2)} em "${offer.listing.title}". Finalize a compra antes que a oferta expire.`,
        { offerId, listingId: offer.listingId },
        'offers',
      )
      .catch(() => {
        /* never let notification failure break an offer accept */
      });

    return updated;
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

    const updated = await this.prisma.offer.update({
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

    // Notify the buyer — offer was declined so they stop waiting.
    this.notifications
      .createNotification(
        offer.buyerId,
        'OFFER_REJECTED',
        'Sua oferta foi recusada',
        `O vendedor recusou sua oferta em "${offer.listing.title}". Você pode fazer uma nova oferta ou comprar pelo preço cheio.`,
        { offerId, listingId: offer.listingId },
        'offers',
      )
      .catch(() => {
        /* never let notification failure break an offer reject */
      });

    return updated;
  }
}
