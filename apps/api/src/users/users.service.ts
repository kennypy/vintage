import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CreateAddressDto } from './dto/create-address.dto';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  /** Full profile for the authenticated user — includes wallet balance and listing count. */
  async getMyProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        avatarUrl: true,
        bio: true,
        verified: true,
        vacationMode: true,
        ratingAvg: true,
        ratingCount: true,
        followerCount: true,
        followingCount: true,
        createdAt: true,
        wallet: { select: { balanceBrl: true } },
        _count: { select: { listings: { where: { status: 'ACTIVE' } } } },
      },
    });

    if (!user) throw new NotFoundException('Usuário não encontrado');

    const { wallet, _count, ...rest } = user;
    return {
      ...rest,
      walletBalance: Number(wallet?.balanceBrl ?? 0),
      listingCount: _count.listings,
    };
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        avatarUrl: true,
        bio: true,
        verified: true,
        vacationMode: true,
        ratingAvg: true,
        ratingCount: true,
        followerCount: true,
        followingCount: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    return user;
  }

  async updateProfile(userId: string, currentUserId: string, dto: UpdateProfileDto) {
    if (userId !== currentUserId) {
      throw new ForbiddenException('Você só pode editar seu próprio perfil');
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.bio !== undefined && { bio: dto.bio }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.avatarUrl !== undefined && { avatarUrl: dto.avatarUrl }),
      },
      select: {
        id: true,
        name: true,
        bio: true,
        phone: true,
        avatarUrl: true,
      },
    });
  }

  async getUserListings(userId: string, page: number = 1, pageSize: number = 20) {
    const skip = (page - 1) * pageSize;

    const [items, total] = await Promise.all([
      this.prisma.listing.findMany({
        where: { sellerId: userId, status: 'ACTIVE' },
        include: {
          images: { orderBy: { position: 'asc' }, take: 1 },
          category: { select: { namePt: true, slug: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.listing.count({
        where: { sellerId: userId, status: 'ACTIVE' },
      }),
    ]);

    return {
      items,
      total,
      page,
      pageSize,
      hasMore: skip + items.length < total,
    };
  }

  // --- Addresses ---

  async getAddresses(userId: string) {
    return this.prisma.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { id: 'asc' }],
    });
  }

  async createAddress(userId: string, dto: CreateAddressDto) {
    // If this is the first address or marked as default, unset other defaults
    if (dto.isDefault) {
      await this.prisma.address.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      });
    }

    const count = await this.prisma.address.count({ where: { userId } });

    return this.prisma.address.create({
      data: {
        userId,
        label: dto.label,
        street: dto.street,
        number: dto.number,
        complement: dto.complement ?? null,
        neighborhood: dto.neighborhood,
        city: dto.city,
        state: dto.state,
        cep: dto.cep.replace(/\D/g, '').replace(/(\d{5})(\d{3})/, '$1-$2'),
        isDefault: dto.isDefault ?? count === 0, // First address is default
      },
    });
  }

  async deleteAddress(userId: string, addressId: string) {
    const address = await this.prisma.address.findFirst({
      where: { id: addressId, userId },
    });

    if (!address) {
      throw new NotFoundException('Endereço não encontrado');
    }

    await this.prisma.address.delete({ where: { id: addressId } });

    // If deleted address was default, make the first remaining one default
    if (address.isDefault) {
      const first = await this.prisma.address.findFirst({
        where: { userId },
        orderBy: { id: 'asc' },
      });
      if (first) {
        await this.prisma.address.update({
          where: { id: first.id },
          data: { isDefault: true },
        });
      }
    }

    return { deleted: true };
  }

  // --- Follow ---

  async followUser(followerId: string, followingId: string) {
    if (followerId === followingId) {
      throw new ForbiddenException('Você não pode seguir a si mesmo');
    }

    const target = await this.prisma.user.findUnique({ where: { id: followingId } });
    if (!target) {
      throw new NotFoundException('Usuário não encontrado');
    }

    await this.prisma.follow.upsert({
      where: { followerId_followingId: { followerId, followingId } },
      create: { followerId, followingId },
      update: {},
    });

    await Promise.all([
      this.prisma.user.update({ where: { id: followingId }, data: { followerCount: { increment: 1 } } }),
      this.prisma.user.update({ where: { id: followerId }, data: { followingCount: { increment: 1 } } }),
    ]);

    return { following: true };
  }

  async unfollowUser(followerId: string, followingId: string) {
    const existing = await this.prisma.follow.findUnique({
      where: { followerId_followingId: { followerId, followingId } },
    });

    if (!existing) return { following: false };

    await this.prisma.follow.delete({
      where: { followerId_followingId: { followerId, followingId } },
    });

    await Promise.all([
      this.prisma.user.update({ where: { id: followingId }, data: { followerCount: { decrement: 1 } } }),
      this.prisma.user.update({ where: { id: followerId }, data: { followingCount: { decrement: 1 } } }),
    ]);

    return { following: false };
  }

  // --- Storefront ---

  async getStorefront(username: string, page: number = 1, pageSize: number = 20) {
    // Search by name field (case-insensitive) since User model has no username field
    const user = await this.prisma.user.findFirst({
      where: { name: { equals: username, mode: 'insensitive' } },
      select: {
        id: true,
        name: true,
        avatarUrl: true,
        bio: true,
        verified: true,
        ratingAvg: true,
        ratingCount: true,
        followerCount: true,
        followingCount: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Loja não encontrada');
    }

    const skip = (page - 1) * pageSize;

    const [items, total] = await Promise.all([
      this.prisma.listing.findMany({
        where: { sellerId: user.id, status: 'ACTIVE' },
        include: {
          images: { orderBy: { position: 'asc' }, take: 1 },
          category: { select: { namePt: true, slug: true } },
          brand: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.listing.count({
        where: { sellerId: user.id, status: 'ACTIVE' },
      }),
    ]);

    return {
      seller: user,
      listings: {
        items,
        total,
        page,
        pageSize,
        hasMore: skip + items.length < total,
      },
    };
  }

  async updateCoverPhoto(userId: string, coverPhotoUrl: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: { coverPhotoUrl },
      select: {
        id: true,
        coverPhotoUrl: true,
      },
    });
  }

  // --- Vacation Mode ---

  async toggleVacationMode(userId: string, enabled: boolean, untilDate?: string) {
    const data: Record<string, unknown> = { vacationMode: enabled };

    if (enabled && untilDate) {
      data.vacationUntil = new Date(untilDate);
    } else if (!enabled) {
      data.vacationUntil = null;
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data,
      select: { vacationMode: true, vacationUntil: true },
    });

    // Pause/unpause all listings
    if (enabled) {
      await this.prisma.listing.updateMany({
        where: { sellerId: userId, status: 'ACTIVE' },
        data: { status: 'PAUSED' },
      });
    } else {
      await this.prisma.listing.updateMany({
        where: { sellerId: userId, status: 'PAUSED' },
        data: { status: 'ACTIVE' },
      });
    }

    return user;
  }

  // --- Account Deletion ---

  async deleteAccount(userId: string) {
    await this.prisma.$transaction(async (tx) => {
      // Soft-delete the user: anonymise PII, ban the account
      await tx.user.update({
        where: { id: userId },
        data: {
          isBanned: true,
          bannedAt: new Date(),
          bannedReason: 'Account deleted by user',
          email: `deleted_${userId}@deleted.vintage.br`,
          name: 'Conta excluída',
          cpf: null,
          avatarUrl: null,
          bio: null,
        },
      });

      // Deactivate all the user's active listings
      await tx.listing.updateMany({
        where: { sellerId: userId, status: 'ACTIVE' },
        data: { status: 'PAUSED' },
      });
    });

    return { success: true };
  }

  // --- Admin Methods ---

  async listUsersAdmin(page: number, pageSize: number, search?: string) {
    const skip = (page - 1) * pageSize;

    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isBanned: true,
          bannedReason: true,
          verified: true,
          createdAt: true,
          _count: {
            select: {
              listings: true,
              ordersBuyer: true,
              ordersSeller: true,
            },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      items: items.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        isBanned: u.isBanned,
        bannedReason: u.bannedReason,
        verified: u.verified,
        createdAt: u.createdAt,
        listingCount: u._count.listings,
        ordersBought: u._count.ordersBuyer,
        ordersSold: u._count.ordersSeller,
      })),
      total,
      page,
      pageSize,
      hasMore: skip + pageSize < total,
    };
  }

  async promoteToAdmin(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuário não encontrado.');
    if (user.role === 'ADMIN') {
      throw new BadRequestException('Usuário já é administrador.');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { role: 'ADMIN' },
    });

    return { success: true, message: `Usuário ${user.name} promovido a administrador.` };
  }
}
