import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Named wishlist collections. A user has an implicit "Favoritos"
 * collection (auto-created on first fetch) plus any named collections
 * they create ("Festa", "Trabalho"). The default collection cannot
 * be renamed or deleted — favorites outside any named collection
 * logically belong to it.
 */
@Injectable()
export class FavoriteCollectionsService {
  private static readonly DEFAULT_NAME = 'Favoritos';
  private static readonly MAX_COLLECTIONS = 20;
  private static readonly MAX_NAME_LEN = 64;

  constructor(private readonly prisma: PrismaService) {}

  private async ensureDefault(userId: string) {
    let def = await this.prisma.favoriteCollection.findFirst({
      where: { userId, isDefault: true },
    });
    if (!def) {
      def = await this.prisma.favoriteCollection
        .create({
          data: {
            userId,
            name: FavoriteCollectionsService.DEFAULT_NAME,
            isDefault: true,
          },
        })
        .catch(async (err) => {
          const code = (err as { code?: string })?.code;
          if (code === 'P2002') {
            // Concurrent first-fetch race — re-read.
            const existing = await this.prisma.favoriteCollection.findFirst({
              where: { userId, isDefault: true },
            });
            if (!existing) throw err;
            return existing;
          }
          throw err;
        });
    }
    return def;
  }

  async list(userId: string) {
    await this.ensureDefault(userId);
    return this.prisma.favoriteCollection.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      include: { _count: { select: { favorites: true } } },
    });
  }

  async create(userId: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > FavoriteCollectionsService.MAX_NAME_LEN) {
      throw new BadRequestException('Nome inválido');
    }
    const count = await this.prisma.favoriteCollection.count({ where: { userId } });
    if (count >= FavoriteCollectionsService.MAX_COLLECTIONS) {
      throw new BadRequestException(
        `Limite de ${FavoriteCollectionsService.MAX_COLLECTIONS} coleções atingido`,
      );
    }
    try {
      return await this.prisma.favoriteCollection.create({
        data: { userId, name: trimmed, isDefault: false },
      });
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code === 'P2002') {
        throw new ConflictException('Você já tem uma coleção com esse nome');
      }
      throw err;
    }
  }

  async rename(userId: string, id: string, name: string) {
    const col = await this.findOwned(userId, id);
    if (col.isDefault) {
      throw new ForbiddenException('A coleção padrão não pode ser renomeada');
    }
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > FavoriteCollectionsService.MAX_NAME_LEN) {
      throw new BadRequestException('Nome inválido');
    }
    try {
      return await this.prisma.favoriteCollection.update({
        where: { id },
        data: { name: trimmed },
      });
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code === 'P2002') {
        throw new ConflictException('Você já tem uma coleção com esse nome');
      }
      throw err;
    }
  }

  async remove(userId: string, id: string) {
    const col = await this.findOwned(userId, id);
    if (col.isDefault) {
      throw new ForbiddenException('A coleção padrão não pode ser removida');
    }
    // Favorites in this collection fall back to the default (collectionId=null
    // via ON DELETE SET NULL). Listing remains favorited.
    await this.prisma.favoriteCollection.delete({ where: { id } });
    return { removed: true };
  }

  async getContents(userId: string, id: string, page = 1, pageSize = 20) {
    const col = await this.findOwned(userId, id);
    page = Math.max(1, Number(page) || 1);
    pageSize = Math.min(100, Math.max(1, Number(pageSize) || 20));
    const skip = (page - 1) * pageSize;

    // Default collection = everything the user favorited that isn't in
    // another named collection.
    const where = col.isDefault
      ? { userId, collectionId: null }
      : { collectionId: id };

    const [items, total] = await Promise.all([
      this.prisma.favorite.findMany({
        where,
        include: {
          listing: {
            include: {
              images: { orderBy: { position: 'asc' }, take: 1 },
              seller: { select: { id: true, name: true, cpfIdentityVerified: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.favorite.count({ where }),
    ]);

    return {
      collection: col,
      items,
      total,
      page,
      pageSize,
      hasMore: skip + items.length < total,
    };
  }

  /**
   * Move an existing favorite between collections. Passing null
   * returns the item to the default collection.
   */
  async moveFavorite(userId: string, listingId: string, collectionId: string | null) {
    const fav = await this.prisma.favorite.findUnique({
      where: { userId_listingId: { userId, listingId } },
    });
    if (!fav) throw new NotFoundException('Item não está nos favoritos');

    if (collectionId) {
      const col = await this.findOwned(userId, collectionId);
      // Default collection is represented by null collectionId so the
      // unique index on (userId, listingId) keeps its semantics.
      collectionId = col.isDefault ? null : col.id;
    }

    return this.prisma.favorite.update({
      where: { userId_listingId: { userId, listingId } },
      data: { collectionId },
    });
  }

  private async findOwned(userId: string, id: string) {
    const col = await this.prisma.favoriteCollection.findUnique({ where: { id } });
    if (!col) throw new NotFoundException('Coleção não encontrada');
    if (col.userId !== userId) throw new ForbiddenException('Acesso negado');
    return col;
  }
}
