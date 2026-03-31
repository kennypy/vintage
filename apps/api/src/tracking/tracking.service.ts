import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { Prisma, UserEventType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TrackEventDto } from './dto/track-event.dto';

const METADATA_MAX_KEYS = 10;
const METADATA_VALUE_MAX_LEN = 256;

@Injectable()
export class TrackingService {
  private readonly logger = new Logger(TrackingService.name);

  constructor(private readonly prisma: PrismaService) {}

  async trackEvent(
    dto: TrackEventDto,
    userId: string | null,
    ip: string,
  ): Promise<void> {
    const ipHash = crypto.createHash('sha256').update(ip).digest('hex');

    // Sanitise metadata — cap keys and value length to prevent data bloat
    const safeMetadata = this.sanitiseMetadata(dto.metadata ?? {});

    // Fire-and-forget — tracking must never block the main request path
    this.prisma.userEvent
      .create({
        data: {
          userId: userId ?? null,
          sessionId: dto.sessionId,
          deviceId: dto.deviceId ?? null,
          eventType: dto.eventType,
          entityType: dto.entityType ?? null,
          entityId: dto.entityId ?? null,
          metadata: safeMetadata,
          ipHash,
        },
      })
      .catch((err: unknown) =>
        this.logger.error('Failed to persist user event', String(err).slice(0, 200)),
      );

    // If the user is authenticated and provided a deviceId, update cross-device link
    if (userId && dto.deviceId && dto.platform) {
      this.upsertDeviceLink(userId, dto.deviceId, dto.platform).catch(
        (err: unknown) =>
          this.logger.error('Failed to upsert device link', String(err).slice(0, 200)),
      );
    }
  }

  // Retroactively assign anonymous events to a user when they log in
  async linkSessionToUser(sessionId: string, userId: string): Promise<void> {
    await this.prisma.userEvent.updateMany({
      where: { sessionId, userId: null },
      data: { userId },
    });
  }

  private async upsertDeviceLink(
    userId: string,
    deviceId: string,
    platform: string,
  ): Promise<void> {
    await this.prisma.deviceLink.upsert({
      where: { userId_deviceId: { userId, deviceId } },
      create: { userId, deviceId, platform },
      update: { platform },
    });
  }

  // Retrieve all devices known for a user (for cross-device profile merging)
  async getUserDevices(userId: string): Promise<string[]> {
    const links = await this.prisma.deviceLink.findMany({
      where: { userId },
      select: { deviceId: true },
    });
    return links.map((l) => l.deviceId);
  }

  // LGPD Art. 18 — delete all tracking data for a user
  async deleteUserTrackingData(userId: string): Promise<void> {
    await Promise.all([
      this.prisma.userEvent.deleteMany({ where: { userId } }),
      this.prisma.deviceLink.deleteMany({ where: { userId } }),
      this.prisma.userAdProfile.deleteMany({ where: { userId } }),
    ]);
  }

  // Return all events for a user — LGPD right to access
  async getUserEvents(userId: string, limit = 100) {
    return this.prisma.userEvent.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        eventType: true,
        entityType: true,
        entityId: true,
        createdAt: true,
        // Never expose ipHash in user-facing responses
      },
    });
  }

  private sanitiseMetadata(
    raw: Record<string, unknown>,
  ): Prisma.InputJsonValue {
    const entries = Object.entries(raw).slice(0, METADATA_MAX_KEYS);
    const safe: Record<string, Prisma.InputJsonValue> = {};
    for (const [k, v] of entries) {
      if (typeof v === 'string') {
        safe[k] = v.slice(0, METADATA_VALUE_MAX_LEN);
      } else if (typeof v === 'number' || typeof v === 'boolean') {
        safe[k] = v;
      }
      // Silently drop nested objects to prevent recursive bloat
    }
    return safe;
  }

  // Count recent events by type for a device/IP — used by bot detection
  async recentEventCount(
    ipHash: string,
    eventType: UserEventType,
    windowMs: number,
  ): Promise<number> {
    const since = new Date(Date.now() - windowMs);
    return this.prisma.userEvent.count({
      where: { ipHash, eventType, createdAt: { gte: since } },
    });
  }
}
