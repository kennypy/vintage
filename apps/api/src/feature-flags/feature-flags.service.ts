import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFeatureFlagDto } from './dto/create-feature-flag.dto';
import { UpdateFeatureFlagDto } from './dto/update-feature-flag.dto';

@Injectable()
export class FeatureFlagsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.featureFlag.findMany({
      orderBy: { key: 'asc' },
    });
  }

  /**
   * Public-safe projection: just { key, enabled }. Mobile / web clients
   * use this to gate UI on boot. Internal description, metadata, and
   * updatedAt stay admin-only — exposing them would let attackers map
   * our planned features and rollout timelines.
   */
  async findAllPublic(): Promise<Array<{ key: string; enabled: boolean }>> {
    return this.prisma.featureFlag.findMany({
      orderBy: { key: 'asc' },
      select: { key: true, enabled: true },
    });
  }

  async create(dto: CreateFeatureFlagDto) {
    const existing = await this.prisma.featureFlag.findUnique({
      where: { key: dto.key },
    });
    if (existing) {
      throw new ConflictException(`Feature flag "${dto.key}" already exists.`);
    }

    return this.prisma.featureFlag.create({
      data: {
        key: dto.key,
        enabled: dto.enabled ?? false,
        description: dto.description ?? null,
        metadata: (dto.metadata as Prisma.InputJsonValue) ?? undefined,
      },
    });
  }

  async update(id: string, dto: UpdateFeatureFlagDto) {
    const flag = await this.prisma.featureFlag.findUnique({ where: { id } });
    if (!flag) {
      throw new NotFoundException('Feature flag not found.');
    }

    return this.prisma.featureFlag.update({
      where: { id },
      data: {
        ...(dto.enabled !== undefined && { enabled: dto.enabled }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.metadata !== undefined && { metadata: dto.metadata as Prisma.InputJsonValue }),
      },
    });
  }

  async remove(id: string) {
    const flag = await this.prisma.featureFlag.findUnique({ where: { id } });
    if (!flag) {
      throw new NotFoundException('Feature flag not found.');
    }

    await this.prisma.featureFlag.delete({ where: { id } });
    return { deleted: true, id };
  }
}
