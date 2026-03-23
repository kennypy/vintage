import {
  Injectable, NotFoundException, ForbiddenException, BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateListingDto } from './dto/create-listing.dto';
import { UpdateListingDto } from './dto/update-listing.dto';
import { SearchListingsDto } from './dto/search-listings.dto';
import { MAX_LISTING_IMAGES } from '@vintage/shared';

@Injectable()
export class ListingsService {
  constructor(private prisma: PrismaService) {}

  async create(sellerId: string, dto: CreateListingDto) {
    const seller = await this.prisma.user.findUnique({
      where: { id: sellerId },
      select: { vacationMode: true },
    });

    if (seller?.vacationMode) {
      throw new BadRequestException('Desative o modo férias antes de criar anúncios');
    }

    if (dto.imageUrls.length === 0) {
      throw new BadRequestException('Adicione pelo menos uma foto');
    }

    if (dto.imageUrls.length > MAX_LISTING_IMAGES) {
      throw new BadRequestException(`Máximo de ${MAX_LISTING_IMAGES} fotos por anúncio`);
    }

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
        category: true,
        brand: true,
        seller: {
          select: {
            id: true, name: true, avatarUrl: true, verified: true,
            ratingAvg: true, ratingCount: true, createdAt: true,
          },
        },
      },
    });

    if (!listing || listing.status === 'DELETED') {
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
    const page = dto.page ?? 1;
    const pageSize = dto.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const where: Prisma.ListingWhereInput = { status: 'ACTIVE' };

    if (dto.q) {
      where.OR = [
        { title: { contains: dto.q, mode: 'insensitive' } },
        { description: { contains: dto.q, mode: 'insensitive' } },
      ];
    }
    if (dto.categoryId) where.categoryId = dto.categoryId;
    if (dto.brandId) where.brandId = dto.brandId;
    if (dto.condition) where.condition = dto.condition as Prisma.EnumItemConditionFilter;
    if (dto.size) where.size = dto.size;
    if (dto.color) where.color = { contains: dto.color, mode: 'insensitive' };

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
    const skip = (page - 1) * pageSize;
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
        take: pageSize,
      }),
      this.prisma.favorite.count({ where: { userId } }),
    ]);

    return {
      items: items.map((f) => f.listing),
      total, page, pageSize, hasMore: skip + items.length < total,
    };
  }

  async getCategories() {
    return this.prisma.category.findMany({
      where: { parentId: null },
      include: { children: true },
      orderBy: { namePt: 'asc' },
    });
  }

  async searchBrands(query: string) {
    return this.prisma.brand.findMany({
      where: { name: { contains: query, mode: 'insensitive' } },
      take: 20,
      orderBy: { name: 'asc' },
    });
  }
}
