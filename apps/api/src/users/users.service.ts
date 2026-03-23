import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CreateAddressDto } from './dto/create-address.dto';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

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
}
