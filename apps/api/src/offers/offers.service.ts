import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { warnAndSwallow } from '../common/utils/fire-and-forget';
import { CreateOfferDto } from './dto/create-offer.dto';
import { CounterOfferDto } from './dto/counter-offer.dto';
import {
  MIN_OFFER_PERCENTAGE,
  OFFER_EXPIRY_HOURS,
  MAX_OFFER_COUNTERS,
  containsProhibitedContent,
} from '@vintage/shared';

@Injectable()
export class OffersService {
  private readonly logger = new Logger(OffersService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  /**
   * Find the latest PENDING offer between `userId` and the seller of
   * `listingId` (or where `userId` IS the seller and has a buyer's
   * pending offer). Used by both chat surfaces to decide whether to
   * show the accept/reject/counter banner without forcing the client
   * to list every offer it ever made. Returns null if no chain is
   * active or the user isn't a party.
   */
  async findActiveForListing(userId: string, listingId: string) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: { id: true, sellerId: true },
    });
    if (!listing) return null;

    // Seller sees PENDING offers from anyone on their listing;
    // buyer only sees their own. The `counteredById !== userId`
    // predicate (applied on the caller side) tells the UI whether
    // the CURRENT viewer is the next expected actor — mirrors the
    // `/offers/[id]` thread page.
    const where =
      listing.sellerId === userId
        ? { listingId, status: 'PENDING' as const }
        : { listingId, status: 'PENDING' as const, buyerId: userId };

    return this.prisma.offer.findFirst({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

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
        counteredById: buyerId,
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
      .catch(warnAndSwallow(this.logger, 'offer.create.notify'));

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

    // Claim the PENDING offer atomically. A concurrent counter()/reject()
    // could both pass the outer status check (read happens OUTSIDE any
    // tx); without updateMany gating, the second writer silently
    // overwrites the first — e.g. an offer marked COUNTERED by the other
    // party's counter could be retrograded to ACCEPTED.
    const claim = await this.prisma.offer.updateMany({
      where: { id: offerId, status: 'PENDING', expiresAt: { gt: new Date() } },
      data: { status: 'ACCEPTED' },
    });
    if (claim.count === 0) {
      throw new ConflictException(
        'Esta oferta já foi atualizada por outra ação.',
      );
    }
    const updated = await this.prisma.offer.findUniqueOrThrow({
      where: { id: offerId },
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
      .catch(warnAndSwallow(this.logger, 'offer.accept.notify'));

    return updated;
  }

  /**
   * Counter an offer. Alternating semantics: seller counters buyer's
   * offer, buyer counters seller's counter. The server derives the
   * next expected party from `counteredById` on the latest link in
   * the chain — clients cannot spoof it.
   *
   * Chain depth is capped at MAX_OFFER_COUNTERS. The previous offer
   * is marked COUNTERED; a new Offer row is created with parentOfferId
   * pointing at it. Expiry resets to now + OFFER_EXPIRY_HOURS.
   */
  async counter(offerId: string, actorId: string, dto: CounterOfferDto) {
    const prev = await this.prisma.offer.findUnique({
      where: { id: offerId },
      include: { listing: true },
    });
    if (!prev) {
      throw new NotFoundException('Oferta não encontrada');
    }
    if (prev.status !== 'PENDING') {
      throw new BadRequestException('Esta oferta não está mais pendente');
    }
    if (prev.expiresAt <= new Date()) {
      throw new BadRequestException('Esta oferta expirou');
    }
    if (prev.counterCount >= MAX_OFFER_COUNTERS) {
      throw new BadRequestException(
        `Limite de ${MAX_OFFER_COUNTERS} contrapropostas atingido`,
      );
    }

    // Alternation: the caller must be the OTHER party from whoever
    // made the current offer. If the buyer placed the current offer,
    // the seller counters (and vice-versa).
    const lastActor = prev.counteredById ?? prev.buyerId;
    if (actorId === lastActor) {
      throw new ForbiddenException(
        'Aguarde a resposta da outra parte antes de fazer uma nova contraproposta.',
      );
    }
    // The counter must come from someone legitimately on the chain —
    // either the listing's seller or the original buyer.
    if (actorId !== prev.listing.sellerId && actorId !== prev.buyerId) {
      throw new ForbiddenException('Apenas comprador ou vendedor podem contrapropor.');
    }

    // 50% floor relative to listing price still applies.
    const minAmount = Number(prev.listing.priceBrl) * MIN_OFFER_PERCENTAGE;
    if (dto.amountBrl < minAmount) {
      throw new BadRequestException(
        `O valor mínimo é R$ ${minAmount.toFixed(2)} (50% do preço do anúncio)`,
      );
    }

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + OFFER_EXPIRY_HOURS);

    const newOffer = await this.prisma.$transaction(async (tx) => {
      // Mark previous as COUNTERED (claim-style updateMany so a double
      // counter race is refused — the loser gets count=0).
      const claim = await tx.offer.updateMany({
        where: { id: offerId, status: 'PENDING' },
        data: { status: 'COUNTERED' },
      });
      if (claim.count === 0) {
        throw new ConflictException('Oferta já foi atualizada por outra ação.');
      }
      return tx.offer.create({
        data: {
          listingId: prev.listingId,
          buyerId: prev.buyerId,
          amountBrl: dto.amountBrl,
          status: 'PENDING',
          expiresAt,
          parentOfferId: prev.id,
          counterCount: prev.counterCount + 1,
          counteredById: actorId,
        },
        include: {
          listing: {
            include: { images: { orderBy: { position: 'asc' }, take: 1 } },
          },
          buyer: { select: { id: true, name: true, avatarUrl: true } },
        },
      });
    });

    // Notify the other party.
    const recipient =
      actorId === prev.listing.sellerId ? prev.buyerId : prev.listing.sellerId;
    this.notifications
      .createNotification(
        recipient,
        'OFFER_COUNTERED',
        'Contraproposta recebida',
        `Nova contraproposta de R$ ${Number(dto.amountBrl).toFixed(2)} em "${prev.listing.title}".`,
        { offerId: newOffer.id, listingId: prev.listingId, parentOfferId: prev.id },
        'offers',
      )
      .catch(warnAndSwallow(this.logger, 'offer.counter.notify'));

    return newOffer;
  }

  /**
   * Walk the parentOfferId chain and return the full negotiation
   * thread in chronological order. Tenant-scoped: only participants
   * (buyer or listing seller) can read.
   */
  async findThread(offerId: string, userId: string) {
    const seed = await this.prisma.offer.findUnique({
      where: { id: offerId },
      include: { listing: { select: { sellerId: true } } },
    });
    if (!seed) {
      throw new NotFoundException('Oferta não encontrada');
    }
    if (seed.buyerId !== userId && seed.listing.sellerId !== userId) {
      throw new ForbiddenException('Acesso negado');
    }
    // Walk UP to find root, then fetch the whole chain ordered by createdAt.
    let root = seed;
    while (root.parentOfferId) {
      const parent = await this.prisma.offer.findUnique({
        where: { id: root.parentOfferId },
        include: { listing: { select: { sellerId: true } } },
      });
      if (!parent) break;
      root = parent;
    }
    const thread = await this.prisma.offer.findMany({
      where: {
        OR: [
          { id: root.id },
          { parentOfferId: root.id },
        ],
      },
      orderBy: { createdAt: 'asc' },
    });
    // Chain may go deeper — fetch descendants recursively via a wide
    // IN query bounded by MAX_OFFER_COUNTERS. Cheaper than N roundtrips.
    const rootIds = thread.map((o) => o.id);
    const deeper = await this.prisma.offer.findMany({
      where: {
        parentOfferId: { in: rootIds },
        id: { notIn: rootIds },
      },
      orderBy: { createdAt: 'asc' },
    });
    return [...thread, ...deeper].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );
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

    // Same atomic claim as accept(): a concurrent counter() racing
    // reject() used to let the REJECTED write stomp on the COUNTERED
    // write (or vice-versa) depending on commit order.
    const claim = await this.prisma.offer.updateMany({
      where: { id: offerId, status: 'PENDING' },
      data: { status: 'REJECTED' },
    });
    if (claim.count === 0) {
      throw new ConflictException(
        'Esta oferta já foi atualizada por outra ação.',
      );
    }
    const updated = await this.prisma.offer.findUniqueOrThrow({
      where: { id: offerId },
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
      .catch(warnAndSwallow(this.logger, 'offer.reject.notify'));

    return updated;
  }
}
