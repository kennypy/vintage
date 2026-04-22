import {
  Injectable, Logger, NotFoundException, ForbiddenException, BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SearchService } from '../search/search.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AnalyticsService, AnalyticsEvents } from '../analytics/analytics.service';
import { buildAllowedImageHosts, validateImageUrl } from '../common/validators/image-url.validator';
import { CreateListingDto } from './dto/create-listing.dto';
import { UpdateListingDto } from './dto/update-listing.dto';
import { SearchListingsDto } from './dto/search-listings.dto';
import { MAX_LISTING_IMAGES, containsProhibitedContent } from '@vintage/shared';
import { warnAndSwallow } from '../common/utils/fire-and-forget';
import { FraudService } from '../fraud/fraud.service';

@Injectable()
export class ListingsService {
  private readonly logger = new Logger(ListingsService.name);
  private readonly allowedImageHosts: string[];

  constructor(
    private prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly searchService: SearchService,
    private readonly analytics: AnalyticsService,
    private readonly notifications: NotificationsService,
    private readonly fraud: FraudService,
  ) {
    this.allowedImageHosts = buildAllowedImageHosts(this.config);
  }

  private validateImageUrls(urls: string[]): void {
    for (const u of urls) validateImageUrl(u, this.allowedImageHosts);
  }

  /**
   * Reconcile a listing's state in Meilisearch. Only ACTIVE listings
   * belong in the search index; anything else is removed so buyers
   * never see SOLD/PAUSED/DELETED items in search results. Errors
   * are swallowed — search indexing is a best-effort sidecar and must
   * never fail a listing mutation. A nightly reindex script catches
   * any drift.
   */
  async syncSearchIndex(listingId: string): Promise<void> {
    try {
      const listing = await this.prisma.listing.findUnique({
        where: { id: listingId },
        include: {
          images: { orderBy: { position: 'asc' }, take: 1 },
          category: { select: { namePt: true, slug: true } },
          brand: { select: { name: true } },
        },
      });

      if (!listing || listing.status !== 'ACTIVE') {
        await this.searchService.removeListing(listingId);
        return;
      }

      await this.searchService.indexListing({
        id: listing.id,
        title: listing.title,
        description: listing.description,
        sellerId: listing.sellerId,
        categoryId: listing.categoryId,
        brandId: listing.brandId ?? null,
        category: listing.category?.namePt ?? null,
        brand: listing.brand?.name ?? null,
        condition: listing.condition,
        size: listing.size ?? null,
        color: listing.color ?? null,
        priceBrl: Number(listing.priceBrl),
        status: listing.status,
        viewCount: listing.viewCount,
        imageUrl: listing.images[0]?.url ?? null,
        createdAt: listing.createdAt.getTime(),
      });
    } catch (err) {
      this.logger.warn(
        `Meilisearch sync failed for listing ${listingId}: ${String(err).slice(0, 200)}`,
      );
    }
  }

  async create(sellerId: string, dto: CreateListingDto) {
    const seller = await this.prisma.user.findUnique({
      where: { id: sellerId },
      select: { vacationMode: true, isBanned: true, cpfIdentityVerified: true, cpfChecksumValid: true },
    });

    if (seller?.isBanned) {
      throw new ForbiddenException('Sua conta está suspensa.');
    }

    if (seller?.vacationMode) {
      throw new BadRequestException('Desative o modo férias antes de criar anúncios');
    }

    // KYC-gated listing creation. When IDENTITY_VERIFICATION_ENABLED is on,
    // sellers must have completed identity verification (Serpro/CAF) before
    // they can list. This closes the ban-evasion loop where a suspended user
    // re-registers with a fresh email and immediately starts selling. We
    // keep it behind a flag so initial rollout and markets without the KYC
    // vendor active can still onboard — but the cpfChecksumValid fallback
    // is always enforced to reject malformed CPF inputs.
    const kycEnforced =
      this.config.get<string>('IDENTITY_VERIFICATION_ENABLED') === 'true';
    if (kycEnforced && !seller?.cpfIdentityVerified) {
      throw new ForbiddenException(
        'Verifique sua identidade antes de criar anúncios. Acesse suas configurações e conclua a verificação de CPF.',
      );
    }
    if (!seller?.cpfChecksumValid) {
      throw new ForbiddenException(
        'CPF inválido. Atualize seu cadastro antes de criar anúncios.',
      );
    }

    // LISTING_VELOCITY — flag (or block, if the rule is set to BLOCK)
    // sellers publishing an unusual burst of items. See FraudService.
    const fraudDecision = await this.fraud.evaluateListingCreation(sellerId);
    if (fraudDecision.action === 'BLOCK') {
      throw new ForbiddenException(
        'Você atingiu o limite de novos anúncios por período. Aguarde algumas horas ou entre em contato com o suporte.',
      );
    }

    // Prohibited content check
    if (
      containsProhibitedContent(dto.title).matched ||
      containsProhibitedContent(dto.description).matched
    ) {
      throw new BadRequestException('Seu anúncio contém termos não permitidos na plataforma.');
    }

    if (dto.imageUrls.length === 0) {
      throw new BadRequestException('Adicione pelo menos uma foto');
    }

    if (dto.imageUrls.length > MAX_LISTING_IMAGES) {
      throw new BadRequestException(`Máximo de ${MAX_LISTING_IMAGES} fotos por anúncio`);
    }

    // SSRF / data-exfil defense: only allow images from known-good hosts.
    this.validateImageUrls(dto.imageUrls);

    const category = await this.prisma.category.findUnique({
      where: { id: dto.categoryId },
    });
    if (!category) {
      throw new BadRequestException('Categoria inválida');
    }

    if (dto.brandId) {
      const brand = await this.prisma.brand.findUnique({ where: { id: dto.brandId } });
      if (!brand) {
        throw new BadRequestException('Marca inválida');
      }
    }

    const created = await this.prisma.listing.create({
      data: {
        sellerId,
        title: dto.title,
        description: dto.description,
        categoryId: dto.categoryId,
        brandId: dto.brandId ?? null,
        condition: dto.condition,
        size: dto.size ?? null,
        color: dto.color ?? null,
        priceBrl: dto.priceBrl,
        shippingWeightG: dto.shippingWeightG,
        images: {
          create: dto.imageUrls.map((url, index) => ({
            url,
            position: index,
            width: 0,
            height: 0,
          })),
        },
      },
      include: {
        images: { orderBy: { position: 'asc' } },
        category: true,
        brand: true,
      },
    });

    // Fire-and-forget: Meilisearch sync never blocks the response.
    this.syncSearchIndex(created.id).catch(warnAndSwallow(this.logger, 'listing.create.search-sync'));

    this.analytics.capture(sellerId, AnalyticsEvents.LISTING_CREATED, {
      listingId: created.id,
      categoryId: created.categoryId,
      priceBrl: Number(created.priceBrl),
      imageCount: dto.imageUrls.length,
    });

    return created;
  }

  async findOne(id: string) {
    const listing = await this.prisma.listing.findUnique({
      where: { id },
      include: {
        images: { orderBy: { position: 'asc' } },
        videos: true,
        category: true,
        brand: true,
        seller: {
          select: {
            id: true, name: true, avatarUrl: true, verified: true, cpfIdentityVerified: true,
            ratingAvg: true, ratingCount: true, createdAt: true,
            twoFaEnabled: true,
          },
        },
      },
    });

    if (!listing || listing.status === 'DELETED' || listing.status === 'SUSPENDED') {
      throw new NotFoundException('Anúncio não encontrado');
    }

    // Increment view count
    this.prisma.listing.update({
      where: { id },
      data: { viewCount: { increment: 1 } },
    }).catch(warnAndSwallow(this.logger, 'listing.viewcount-bump'));

    return listing;
  }

  async search(dto: SearchListingsDto) {
    const page = Math.max(1, dto.page ?? 1);
    const pageSize = Math.min(Math.max(1, dto.pageSize ?? 20), 100);
    const skip = (page - 1) * pageSize;

    const where: Prisma.ListingWhereInput = { status: 'ACTIVE' };

    if (dto.q) {
      where.OR = [
        { title: { contains: dto.q, mode: 'insensitive' } },
        { description: { contains: dto.q, mode: 'insensitive' } },
      ];
    }

    // Resolve categoryId from explicit ID or name/slug
    let resolvedCategoryId = dto.categoryId;
    if (!resolvedCategoryId && dto.category) {
      const found = await this.prisma.category.findFirst({
        where: {
          OR: [
            { namePt: { contains: dto.category, mode: 'insensitive' } },
            { slug: { contains: dto.category.toLowerCase().replace(/\s+/g, '-'), mode: 'insensitive' } },
          ],
        },
        select: { id: true },
      });
      resolvedCategoryId = found?.id;
    }
    if (resolvedCategoryId) where.categoryId = resolvedCategoryId;

    // Resolve brandId from explicit ID or name
    let resolvedBrandId = dto.brandId;
    if (!resolvedBrandId && dto.brand) {
      const found = await this.prisma.brand.findFirst({
        where: { name: { contains: dto.brand, mode: 'insensitive' } },
        select: { id: true },
      });
      resolvedBrandId = found?.id;
    }
    if (resolvedBrandId) where.brandId = resolvedBrandId;

    if (dto.condition) where.condition = dto.condition as Prisma.EnumItemConditionFilter;
    if (dto.size) where.size = dto.size;
    if (dto.color) where.color = { contains: dto.color, mode: 'insensitive' };

    if (dto.sellerId) where.sellerId = dto.sellerId;

    if (dto.minPrice !== undefined || dto.maxPrice !== undefined) {
      where.priceBrl = {};
      if (dto.minPrice !== undefined) where.priceBrl.gte = dto.minPrice;
      if (dto.maxPrice !== undefined) where.priceBrl.lte = dto.maxPrice;
    }

    let orderBy: Prisma.ListingOrderByWithRelationInput;
    switch (dto.sort) {
      case 'price_asc': orderBy = { priceBrl: 'asc' }; break;
      case 'price_desc': orderBy = { priceBrl: 'desc' }; break;
      case 'relevance': orderBy = { viewCount: 'desc' }; break;
      default: orderBy = { createdAt: 'desc' };
    }

    const [items, total] = await Promise.all([
      this.prisma.listing.findMany({
        where,
        include: {
          images: { orderBy: { position: 'asc' }, take: 1 },
          category: { select: { namePt: true, slug: true } },
          brand: { select: { name: true } },
          seller: { select: { id: true, name: true, avatarUrl: true, verified: true, cpfIdentityVerified: true } },
        },
        orderBy,
        skip,
        take: pageSize,
      }),
      this.prisma.listing.count({ where }),
    ]);

    return { items, total, page, pageSize, hasMore: skip + items.length < total };
  }

  async update(id: string, sellerId: string, dto: UpdateListingDto) {
    const listing = await this.prisma.listing.findUnique({ where: { id } });

    if (!listing || listing.status === 'DELETED') {
      throw new NotFoundException('Anúncio não encontrado');
    }
    if (listing.sellerId !== sellerId) {
      throw new ForbiddenException('Você só pode editar seus próprios anúncios');
    }
    if (listing.status === 'SOLD') {
      throw new BadRequestException('Anúncio já vendido não pode ser editado');
    }

    // Prohibited content check on updated fields
    if (dto.title !== undefined && containsProhibitedContent(dto.title).matched) {
      throw new BadRequestException('Seu anúncio contém termos não permitidos na plataforma.');
    }
    if (dto.description !== undefined && containsProhibitedContent(dto.description).matched) {
      throw new BadRequestException('Seu anúncio contém termos não permitidos na plataforma.');
    }

    const data: Prisma.ListingUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.condition !== undefined) data.condition = dto.condition;
    if (dto.size !== undefined) data.size = dto.size;
    if (dto.color !== undefined) data.color = dto.color;
    if (dto.priceBrl !== undefined) data.priceBrl = dto.priceBrl;
    if (dto.shippingWeightG !== undefined) data.shippingWeightG = dto.shippingWeightG;
    if (dto.categoryId !== undefined) data.category = { connect: { id: dto.categoryId } };
    if (dto.brandId !== undefined) {
      data.brand = dto.brandId ? { connect: { id: dto.brandId } } : { disconnect: true };
    }

    if (dto.imageUrls !== undefined) {
      this.validateImageUrls(dto.imageUrls);
      await this.prisma.listingImage.deleteMany({ where: { listingId: id } });
      data.images = {
        create: dto.imageUrls.map((url, index) => ({
          url, position: index, width: 0, height: 0,
        })),
      };
    }

    // Allow ACTIVE <-> PAUSED toggle and marking as SOLD
    if (dto.status !== undefined) {
      const allowed = ['ACTIVE', 'PAUSED', 'SOLD'] as const;
      if (!allowed.includes(dto.status as typeof allowed[number])) {
        throw new BadRequestException('Status inválido');
      }
      data.status = dto.status;
    }

    const oldPrice = Number(listing.priceBrl);
    const newPrice = dto.priceBrl !== undefined ? Number(dto.priceBrl) : oldPrice;
    const isPriceDrop = dto.priceBrl !== undefined && newPrice < oldPrice;

    const updated = await this.prisma.listing.update({
      where: { id },
      data,
      include: { images: { orderBy: { position: 'asc' } }, category: true, brand: true },
    });

    this.syncSearchIndex(updated.id).catch(warnAndSwallow(this.logger, 'listing.update.search-sync'));

    if (isPriceDrop) {
      // Fire-and-forget so a slow notification batch doesn't block the
      // seller's update response. Alert only users who haven't already
      // been notified for this listing (notifiedAt IS NULL) — prevents a
      // spammy seller who ratchets the price down repeatedly from
      // pinging the same watcher every time.
      this.notifyPriceDrop(updated.id, updated.title, oldPrice, newPrice).catch(
        (err) => this.logger.warn(`price-drop notify failed: ${String(err).slice(0, 200)}`),
      );
    }

    return updated;
  }

  private async notifyPriceDrop(
    listingId: string,
    title: string,
    oldPrice: number,
    newPrice: number,
  ): Promise<void> {
    const alerts = await this.prisma.priceDropAlert.findMany({
      where: { listingId, notifiedAt: null },
      select: { id: true, userId: true },
    });
    if (alerts.length === 0) return;

    await Promise.all(
      alerts.map((a) =>
        this.notifications
          .createNotification(
            a.userId,
            'PRICE_DROP',
            'Item favorito com preço menor',
            `"${title}" caiu de R$ ${oldPrice.toFixed(2)} para R$ ${newPrice.toFixed(2)}.`,
            { listingId },
            'priceDrops',
          )
          .catch(warnAndSwallow(this.logger, 'listing.price-drop-notify')),
      ),
    );

    // Mark notifiedAt so future drops to a different price don't re-ping
    // the same user. A seller who raises and then drops again still only
    // emits one notification per subscriber per listing.
    await this.prisma.priceDropAlert.updateMany({
      where: { id: { in: alerts.map((a) => a.id) } },
      data: { notifiedAt: new Date() },
    });
  }

  async remove(id: string, sellerId: string) {
    const listing = await this.prisma.listing.findUnique({ where: { id } });
    if (!listing) throw new NotFoundException('Anúncio não encontrado');
    if (listing.sellerId !== sellerId) {
      throw new ForbiddenException('Você só pode remover seus próprios anúncios');
    }

    // Option-B snapshot freeze. While any order against this listing
    // is still non-terminal, the buyer may still open a dispute and
    // the dispute UI needs the original images. Since snapshots
    // currently point at the seller's S3 keys (not a copy), we must
    // keep the live Listing + ListingImage rows — and therefore the
    // S3 keys behind them — alive until every outstanding order
    // reaches COMPLETED / CANCELLED / REFUNDED. The restriction
    // lifts automatically once the last non-terminal order closes.
    //
    // When option A (copying image bytes to orders/{id}/snapshots/)
    // is shipped, drop this block — snapshots will no longer depend
    // on the live listing.
    const openOrderCount = await this.prisma.order.count({
      where: {
        listingId: id,
        status: { notIn: ['COMPLETED', 'CANCELLED', 'REFUNDED'] },
      },
    });
    if (openOrderCount > 0) {
      throw new BadRequestException(
        'Não é possível remover este anúncio enquanto houver pedidos em andamento. Aguarde a conclusão das vendas e tente novamente.',
      );
    }

    await this.prisma.listing.update({ where: { id }, data: { status: 'DELETED' } });
    this.syncSearchIndex(id).catch(warnAndSwallow(this.logger, 'listing.search-sync'));
    return { deleted: true };
  }

  async toggleFavorite(listingId: string, userId: string) {
    const listing = await this.prisma.listing.findUnique({ where: { id: listingId } });
    if (!listing || listing.status !== 'ACTIVE') {
      throw new NotFoundException('Anúncio não encontrado');
    }

    const existing = await this.prisma.favorite.findUnique({
      where: { userId_listingId: { userId, listingId } },
    });

    if (existing) {
      await this.prisma.favorite.delete({ where: { userId_listingId: { userId, listingId } } });
      await this.prisma.listing.update({ where: { id: listingId }, data: { favoriteCount: { decrement: 1 } } });
      // Drop the price-drop subscription along with the favorite —
      // "unfavorite" implies "stop pinging me about this one".
      await this.prisma.priceDropAlert
        .deleteMany({ where: { userId, listingId } })
        .catch(warnAndSwallow(this.logger, 'listing.price-drop-alert-cleanup'));
      return { favorited: false };
    }

    await this.prisma.favorite.create({ data: { userId, listingId } });
    await this.prisma.listing.update({ where: { id: listingId }, data: { favoriteCount: { increment: 1 } } });

    // Auto-subscribe to price drops on the favorite. Snapshot the
    // current price as the baseline; the price-drop cron later compares
    // listing.priceBrl against this and notifies once the seller cuts
    // the price. upsert is idempotent if the row somehow already exists
    // (rare — unfavorite+refavorite inside one tick).
    this.prisma.priceDropAlert
      .upsert({
        where: { listingId_userId: { listingId, userId } },
        create: { listingId, userId, originalPriceBrl: listing.priceBrl },
        update: { originalPriceBrl: listing.priceBrl, notifiedAt: null },
      })
      .catch(warnAndSwallow(this.logger, 'listing.price-drop-alert-upsert'));

    // Notify the seller unless they favourited their own item (impossible
    // today because toggleFavorite has no self-check, but cheap defence).
    if (listing.sellerId !== userId) {
      const favoriter = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { name: true },
      });
      this.notifications
        .createNotification(
          listing.sellerId,
          'LISTING_FAVORITED',
          'Alguém favoritou seu anúncio',
          `${favoriter?.name ?? 'Alguém'} adicionou "${listing.title}" aos favoritos.`,
          { listingId, favoriterId: userId },
          'favorites',
        )
        .catch(warnAndSwallow(this.logger, 'listing.favorite-notify'));
    }

    return { favorited: true };
  }

  async getUserFavorites(userId: string, page: number = 1, pageSize: number = 20) {
    const p = Math.max(1, Number(page) || 1);
    const ps = Math.min(100, Math.max(1, Number(pageSize) || 20));
    const skip = (p - 1) * ps;
    const [items, total] = await Promise.all([
      this.prisma.favorite.findMany({
        where: { userId },
        include: {
          listing: {
            include: {
              images: { orderBy: { position: 'asc' }, take: 1 },
              category: { select: { namePt: true } },
              seller: { select: { id: true, name: true, avatarUrl: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: ps,
      }),
      this.prisma.favorite.count({ where: { userId } }),
    ]);

    return {
      items: items.map((f) => f.listing),
      total, page: p, pageSize: ps, hasMore: skip + items.length < total,
    };
  }

  async getCategories() {
    return this.prisma.category.findMany({
      where: { parentId: null },
      include: { children: true },
      orderBy: { namePt: 'asc' },
    });
  }

  async getFollowingFeed(userId: string, page: number = 1, pageSize: number = 20) {
    const p = Math.max(1, Number(page) || 1);
    const ps = Math.min(100, Math.max(1, Number(pageSize) || 20));
    const skip = (p - 1) * ps;

    // Get all users that the current user follows
    const follows = await this.prisma.follow.findMany({
      where: { followerId: userId },
      select: { followingId: true },
    });

    const followingIds = follows.map((f) => f.followingId);

    if (followingIds.length === 0) {
      return { items: [], total: 0, page: p, pageSize: ps, hasMore: false };
    }

    const where: Prisma.ListingWhereInput = {
      sellerId: { in: followingIds },
      status: 'ACTIVE',
    };

    const [items, total] = await Promise.all([
      this.prisma.listing.findMany({
        where,
        include: {
          images: { orderBy: { position: 'asc' }, take: 1 },
          category: { select: { namePt: true, slug: true } },
          brand: { select: { name: true } },
          seller: {
            select: { id: true, name: true, avatarUrl: true, verified: true, cpfIdentityVerified: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: ps,
      }),
      this.prisma.listing.count({ where }),
    ]);

    return { items, total, page: p, pageSize: ps, hasMore: skip + items.length < total };
  }

  /**
   * Trending listings — ranks ACTIVE items by a simple popularity
   * score (favorites weighted 2x views) within the last 14 days.
   * Cheap enough to be computed live; if this endpoint gets hot we
   * can cache with a cron.
   */
  async getTrending(limit = 20) {
    const take = Math.min(100, Math.max(1, Number(limit) || 20));
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 14);

    return this.prisma.listing.findMany({
      where: { status: 'ACTIVE', createdAt: { gte: cutoff } },
      include: {
        images: { orderBy: { position: 'asc' }, take: 1 },
        category: { select: { namePt: true, slug: true } },
        brand: { select: { name: true } },
        seller: { select: { id: true, name: true, avatarUrl: true, verified: true, cpfIdentityVerified: true } },
      },
      // Prisma can't compose arbitrary math in orderBy, so sort by
      // favoriteCount DESC, then viewCount DESC — close enough to
      // (fav*2 + view) in most distributions, and bound by take.
      orderBy: [{ favoriteCount: 'desc' }, { viewCount: 'desc' }, { createdAt: 'desc' }],
      take,
    });
  }

  /**
   * "For you" recommendations. Uses the user's favourited listings
   * to derive a taste profile (top categories + brands) and surfaces
   * ACTIVE listings matching it — excluding the seller's own items
   * and anything they've already favorited.
   *
   * Falls back to trending for users with no favourites yet — the
   * cold-start path.
   */
  async getRecommended(userId: string, limit = 20) {
    const take = Math.min(100, Math.max(1, Number(limit) || 20));

    // Build the taste profile from the most recent 50 favourites.
    const favourites = await this.prisma.favorite.findMany({
      where: { userId },
      select: { listing: { select: { categoryId: true, brandId: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    if (favourites.length === 0) {
      return this.getTrending(take);
    }

    const categoryCounts = new Map<string, number>();
    const brandCounts = new Map<string, number>();
    for (const f of favourites) {
      categoryCounts.set(
        f.listing.categoryId,
        (categoryCounts.get(f.listing.categoryId) ?? 0) + 1,
      );
      if (f.listing.brandId) {
        brandCounts.set(f.listing.brandId, (brandCounts.get(f.listing.brandId) ?? 0) + 1);
      }
    }

    const topCategories = [...categoryCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([id]) => id);
    const topBrands = [...brandCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id]) => id);

    const favouritedIds = new Set(
      (
        await this.prisma.favorite.findMany({
          where: { userId },
          select: { listingId: true },
        })
      ).map((f) => f.listingId),
    );

    return this.prisma.listing.findMany({
      where: {
        status: 'ACTIVE',
        sellerId: { not: userId },
        id: { notIn: [...favouritedIds] },
        OR: [
          { categoryId: { in: topCategories } },
          topBrands.length > 0 ? { brandId: { in: topBrands } } : { id: undefined },
        ],
      },
      include: {
        images: { orderBy: { position: 'asc' }, take: 1 },
        category: { select: { namePt: true, slug: true } },
        brand: { select: { name: true } },
        seller: { select: { id: true, name: true, avatarUrl: true, verified: true, cpfIdentityVerified: true } },
      },
      orderBy: [{ favoriteCount: 'desc' }, { createdAt: 'desc' }],
      take,
    });
  }

  async searchBrands(query: string) {
    const q = typeof query === 'string' ? query.trim() : '';
    if (q.length === 0) {
      throw new BadRequestException('Informe um termo de busca (mínimo 1 caractere).');
    }
    if (q.length > 100) {
      throw new BadRequestException('Termo de busca muito longo (máximo 100 caracteres).');
    }
    return this.prisma.brand.findMany({
      where: { name: { contains: q, mode: 'insensitive' } },
      take: 20,
      orderBy: { name: 'asc' },
    });
  }

  // --- Saved Searches ---

  async saveSearch(userId: string, query: string, filters: Record<string, any>) {
    if (!query || query.trim().length === 0) {
      throw new BadRequestException('Informe um termo de busca');
    }

    const existingCount = await this.prisma.savedSearch.count({
      where: { userId },
    });

    if (existingCount >= 50) {
      throw new BadRequestException('Limite de 50 buscas salvas atingido');
    }

    return this.prisma.savedSearch.create({
      data: {
        userId,
        query: query.trim(),
        filtersJson: filters ?? {},
        notify: true,
      },
    });
  }

  async getSavedSearches(userId: string) {
    return this.prisma.savedSearch.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async deleteSavedSearch(searchId: string, userId: string) {
    const savedSearch = await this.prisma.savedSearch.findUnique({
      where: { id: searchId },
    });

    if (!savedSearch) {
      throw new NotFoundException('Busca salva não encontrada');
    }

    if (savedSearch.userId !== userId) {
      throw new ForbiddenException('Você só pode remover suas próprias buscas salvas');
    }

    await this.prisma.savedSearch.delete({ where: { id: searchId } });
    return { deleted: true };
  }

  // --- Smart Pricing ---

  async getPriceSuggestion(
    categoryId: string,
    brandId?: string,
    condition?: string,
    size?: string,
  ) {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
    });

    if (!category) {
      throw new BadRequestException('Categoria inválida');
    }

    const where: Prisma.OrderWhereInput = {
      status: 'COMPLETED',
      listing: {
        categoryId,
        ...(brandId ? { brandId } : {}),
        ...(condition ? { condition: condition as any } : {}),
        ...(size ? { size } : {}),
      },
    };

    const aggregate = await this.prisma.order.aggregate({
      where,
      _avg: { itemPriceBrl: true },
      _min: { itemPriceBrl: true },
      _max: { itemPriceBrl: true },
      _count: true,
    });

    if (aggregate._count === 0) {
      // Fallback: try with only categoryId
      const fallback = await this.prisma.order.aggregate({
        where: {
          status: 'COMPLETED',
          listing: { categoryId },
        },
        _avg: { itemPriceBrl: true },
        _min: { itemPriceBrl: true },
        _max: { itemPriceBrl: true },
        _count: true,
      });

      if (fallback._count === 0) {
        throw new NotFoundException('Não há dados suficientes para sugestão de preço nesta categoria');
      }

      return {
        suggestedPriceBrl: Number(fallback._avg.itemPriceBrl),
        minPriceBrl: Number(fallback._min.itemPriceBrl),
        maxPriceBrl: Number(fallback._max.itemPriceBrl),
        basedOnCount: fallback._count,
      };
    }

    return {
      suggestedPriceBrl: Number(aggregate._avg.itemPriceBrl),
      minPriceBrl: Number(aggregate._min.itemPriceBrl),
      maxPriceBrl: Number(aggregate._max.itemPriceBrl),
      basedOnCount: aggregate._count,
    };
  }

  // --- Video Listings ---

  /** Attach a video to a listing (max 1 per listing, max 30s). URL from /uploads/listing-video. */
  async setListingVideo(
    listingId: string,
    sellerId: string,
    videoUrl: string,
    thumbnailUrl?: string,
    durationSeconds?: number,
  ) {
    const listing = await this.prisma.listing.findUnique({ where: { id: listingId } });
    if (!listing) throw new NotFoundException('Anúncio não encontrado');
    if (listing.sellerId !== sellerId) throw new ForbiddenException('Acesso negado');

    if (durationSeconds !== undefined && durationSeconds > 30) {
      throw new BadRequestException('O vídeo não pode ter mais de 30 segundos');
    }

    // Upsert — one video per listing (enforced by @@unique in schema)
    return this.prisma.listingVideo.upsert({
      where: { listingId },
      create: { listingId, url: videoUrl, thumbnailUrl: thumbnailUrl ?? null, durationSeconds: durationSeconds ?? null },
      update: { url: videoUrl, thumbnailUrl: thumbnailUrl ?? null, durationSeconds: durationSeconds ?? null },
    });
  }

  /** Remove a listing's video. */
  async removeListingVideo(listingId: string, sellerId: string) {
    const listing = await this.prisma.listing.findUnique({ where: { id: listingId } });
    if (!listing) throw new NotFoundException('Anúncio não encontrado');
    if (listing.sellerId !== sellerId) throw new ForbiddenException('Acesso negado');

    await this.prisma.listingVideo.deleteMany({ where: { listingId } });
    return { deleted: true };
  }
}
