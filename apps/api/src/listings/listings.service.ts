import {
  Injectable, NotFoundException, ForbiddenException, BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateListingDto } from './dto/create-listing.dto';
import { UpdateListingDto } from './dto/update-listing.dto';
import { SearchListingsDto } from './dto/search-listings.dto';
import { MAX_LISTING_IMAGES, containsProhibitedContent } from '@vintage/shared';

/** Default allowlist when ALLOWED_IMAGE_HOSTS env is not configured. */
const DEFAULT_ALLOWED_IMAGE_HOSTS = [
  'picsum.photos',        // dev placeholder
  's3.amazonaws.com',     // generic AWS S3
];

@Injectable()
export class ListingsService {
  private readonly allowedImageHosts: string[];

  constructor(
    private prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    const raw = this.config.get<string>('ALLOWED_IMAGE_HOSTS', '');
    const bucket = this.config.get<string>('S3_BUCKET', '');
    const region = this.config.get<string>('S3_REGION', '');
    const hosts = raw
      .split(',')
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean);

    // Auto-include virtual-hosted-style and path-style S3 URLs for the
    // configured bucket + region so the default config just works.
    if (bucket && region) {
      hosts.push(`${bucket}.s3.${region}.amazonaws.com`);
      hosts.push(`${bucket}.s3.amazonaws.com`);
      hosts.push(`s3.${region}.amazonaws.com`);
    }
    if (hosts.length === 0) {
      hosts.push(...DEFAULT_ALLOWED_IMAGE_HOSTS);
    }
    this.allowedImageHosts = Array.from(new Set(hosts));
  }

  /** Validate a listing image URL is on the configured allowlist (SSRF + data-exfil defense). */
  private validateImageUrl(url: string): void {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new BadRequestException('URL de imagem inválida.');
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new BadRequestException('Protocolo de URL de imagem não permitido.');
    }
    const host = parsed.hostname.toLowerCase();
    const ok = this.allowedImageHosts.some((allowed) => {
      // Exact match or subdomain match
      return host === allowed || host.endsWith(`.${allowed}`);
    });
    if (!ok) {
      throw new BadRequestException(
        `Domínio de imagem não permitido: ${host}`,
      );
    }
  }

  private validateImageUrls(urls: string[]): void {
    for (const u of urls) this.validateImageUrl(u);
  }

  async create(sellerId: string, dto: CreateListingDto) {
    const seller = await this.prisma.user.findUnique({
      where: { id: sellerId },
      select: { vacationMode: true, isBanned: true },
    });

    if (seller?.isBanned) {
      throw new ForbiddenException('Sua conta está suspensa.');
    }

    if (seller?.vacationMode) {
      throw new BadRequestException('Desative o modo férias antes de criar anúncios');
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

    return this.prisma.listing.create({
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
            id: true, name: true, avatarUrl: true, verified: true,
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
    }).catch(() => {/* non-critical */});

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
          seller: { select: { id: true, name: true, avatarUrl: true, verified: true } },
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

    return this.prisma.listing.update({
      where: { id },
      data,
      include: { images: { orderBy: { position: 'asc' } }, category: true, brand: true },
    });
  }

  async remove(id: string, sellerId: string) {
    const listing = await this.prisma.listing.findUnique({ where: { id } });
    if (!listing) throw new NotFoundException('Anúncio não encontrado');
    if (listing.sellerId !== sellerId) {
      throw new ForbiddenException('Você só pode remover seus próprios anúncios');
    }

    await this.prisma.listing.update({ where: { id }, data: { status: 'DELETED' } });
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
      return { favorited: false };
    }

    await this.prisma.favorite.create({ data: { userId, listingId } });
    await this.prisma.listing.update({ where: { id: listingId }, data: { favoriteCount: { increment: 1 } } });
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
            select: { id: true, name: true, avatarUrl: true, verified: true },
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
