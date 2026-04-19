import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { CreateFeatureFlagDto } from './dto/create-feature-flag.dto';
import { UpdateFeatureFlagDto } from './dto/update-feature-flag.dto';

@Injectable()
export class FeatureFlagsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

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

  async create(dto: CreateFeatureFlagDto, actorId: string | null = null) {
    const existing = await this.prisma.featureFlag.findUnique({
      where: { key: dto.key },
    });
    if (existing) {
      throw new ConflictException(`Feature flag "${dto.key}" already exists.`);
    }

    const flag = await this.prisma.featureFlag.create({
      data: {
        key: dto.key,
        enabled: dto.enabled ?? false,
        description: dto.description ?? null,
        metadata: (dto.metadata as Prisma.InputJsonValue) ?? undefined,
      },
    });
    await this.auditLog.record({
      actorId,
      action: 'feature_flag.create',
      targetType: 'feature_flag',
      targetId: flag.id,
      metadata: { key: flag.key, enabled: flag.enabled },
    });
    return flag;
  }

  async update(id: string, dto: UpdateFeatureFlagDto, actorId: string | null = null) {
    const flag = await this.prisma.featureFlag.findUnique({ where: { id } });
    if (!flag) {
      throw new NotFoundException('Feature flag not found.');
    }

    const updated = await this.prisma.featureFlag.update({
      where: { id },
      data: {
        ...(dto.enabled !== undefined && { enabled: dto.enabled }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.metadata !== undefined && { metadata: dto.metadata as Prisma.InputJsonValue }),
      },
    });
    await this.auditLog.record({
      actorId,
      action: 'feature_flag.update',
      targetType: 'feature_flag',
      targetId: id,
      metadata: {
        key: flag.key,
        previousEnabled: flag.enabled,
        nextEnabled: updated.enabled,
      },
    });
    return updated;
  }

  async remove(id: string, actorId: string | null = null) {
    const flag = await this.prisma.featureFlag.findUnique({ where: { id } });
    if (!flag) {
      throw new NotFoundException('Feature flag not found.');
    }

    await this.prisma.featureFlag.delete({ where: { id } });
    await this.auditLog.record({
      actorId,
      action: 'feature_flag.delete',
      targetType: 'feature_flag',
      targetId: id,
      metadata: { key: flag.key },
    });
    return { deleted: true, id };
  }
}
