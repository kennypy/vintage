import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { ConsentType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ConsentService {
  constructor(private readonly prisma: PrismaService) {}

  // Return the current consent state for all types for a user
  async getConsents(userId: string): Promise<Record<ConsentType, boolean>> {
    const records = await this.prisma.consentRecord.findMany({
      where: { userId },
      orderBy: { grantedAt: 'desc' },
    });

    // Latest record per type wins
    const result: Partial<Record<ConsentType, boolean>> = {};
    for (const rec of records) {
      const type = rec.consentType as ConsentType;
      if (!(type in result)) {
        result[type] = rec.revokedAt === null ? rec.granted : false;
      }
    }

    // Default false for any not yet recorded
    const allTypes = Object.values(ConsentType) as ConsentType[];
    for (const t of allTypes) {
      if (!(t in result)) result[t] = false;
    }

    return result as Record<ConsentType, boolean>;
  }

  // Grant or revoke a specific consent type — always append for full audit trail
  async updateConsent(
    userId: string,
    consentType: ConsentType,
    granted: boolean,
    ip: string,
  ): Promise<void> {
    const ipHash = crypto.createHash('sha256').update(ip).digest('hex');

    // If revoking, set revokedAt on any previously granted records for this type
    if (!granted) {
      await this.prisma.consentRecord.updateMany({
        where: { userId, consentType, granted: true, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    await this.prisma.consentRecord.create({
      data: { userId, consentType, granted, ipHash },
    });
  }

  // LGPD Art. 18 — right to erasure: delete all consent records
  async deleteAllConsents(userId: string): Promise<void> {
    await this.prisma.consentRecord.deleteMany({ where: { userId } });
  }

  // Check a single consent type quickly (used by other services)
  async hasConsent(userId: string, consentType: ConsentType): Promise<boolean> {
    const latest = await this.prisma.consentRecord.findFirst({
      where: { userId, consentType },
      orderBy: { grantedAt: 'desc' },
    });
    if (!latest) return false;
    return latest.granted && latest.revokedAt === null;
  }
}
