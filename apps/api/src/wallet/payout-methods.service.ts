import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import {
  isValidPixKey,
  normalisePixKey,
  maskPixKey,
  type PixKeyType,
} from '@vintage/shared';

/**
 * Hard cap on saved methods per user. Launching with a low ceiling keeps
 * the attack surface small — a compromised account can exfiltrate at most
 * MAX_METHODS PIX keys and can't bury legitimate ones under spam entries.
 */
const MAX_METHODS_PER_USER = 5;

export interface PayoutMethodView {
  id: string;
  type: PixKeyType;
  pixKeyMasked: string;
  label: string | null;
  isDefault: boolean;
  createdAt: Date;
}

@Injectable()
export class PayoutMethodsService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
  ) {}

  /**
   * List the user's saved payout methods. Never returns the raw PIX key —
   * only a masked display form safe to render in the UI or log for audit.
   */
  async list(userId: string): Promise<PayoutMethodView[]> {
    const methods = await this.prisma.payoutMethod.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
    return methods.map((m) => this.toView(m));
  }

  /**
   * Create a new payout method. Rejects duplicates (same user + same type +
   * same normalised key), validates the key against its declared type, and
   * normalises the stored value so subsequent lookups are deterministic.
   *
   * All DB writes + the MAX_METHODS_PER_USER count + the duplicate check run
   * inside a single interactive transaction so two concurrent creates can't
   * both see `count < MAX` and overshoot the limit, and can't both "win"
   * the default flag.
   */
  async create(
    userId: string,
    rawInput: {
      type: PixKeyType;
      pixKey: string;
      label?: string;
      isDefault?: boolean;
    },
  ): Promise<PayoutMethodView> {
    const canonical = normalisePixKey(rawInput.pixKey, rawInput.type);
    if (!isValidPixKey(canonical, rawInput.type)) {
      // Mirror the server-side error used by every other input validator.
      // Don't echo back the raw key — it could end up in client logs.
      throw new BadRequestException('Chave PIX inválida para o tipo informado.');
    }

    const label = rawInput.label?.trim().slice(0, 80) || null;

    const created = await this.prisma.$transaction(async (tx) => {
      const existingCount = await tx.payoutMethod.count({ where: { userId } });
      if (existingCount >= MAX_METHODS_PER_USER) {
        throw new BadRequestException(
          `Limite de ${MAX_METHODS_PER_USER} chaves PIX por conta. Remova uma antes de adicionar outra.`,
        );
      }

      const dupe = await tx.payoutMethod.findUnique({
        where: {
          userId_type_pixKey: { userId, type: rawInput.type, pixKey: canonical },
        },
      });
      if (dupe) throw new ConflictException('Esta chave PIX já está cadastrada.');

      const willBeDefault = rawInput.isDefault === true || existingCount === 0;
      if (willBeDefault) {
        await tx.payoutMethod.updateMany({
          where: { userId, isDefault: true },
          data: { isDefault: false },
        });
      }
      return tx.payoutMethod.create({
        data: {
          userId,
          type: rawInput.type,
          pixKey: canonical,
          label,
          isDefault: willBeDefault,
        },
      });
    });

    return this.toView(created);
  }

  /**
   * Delete a payout method. Ownership, delete, and "promote next to
   * default" all run inside one transaction so a concurrent delete can't
   * race the promotion step.
   */
  async delete(userId: string, methodId: string): Promise<{ success: true }> {
    let deletedType: string | null = null;
    await this.prisma.$transaction(async (tx) => {
      const method = await tx.payoutMethod.findUnique({ where: { id: methodId } });
      if (!method || method.userId !== userId) {
        throw new NotFoundException('Chave PIX não encontrada.');
      }
      deletedType = method.type;
      await tx.payoutMethod.delete({ where: { id: methodId } });

      // If we just removed the default, promote the most recent remaining
      // method to default so the user always has one if any exist.
      if (method.isDefault) {
        const next = await tx.payoutMethod.findFirst({
          where: { userId },
          orderBy: { createdAt: 'desc' },
        });
        if (next) {
          await tx.payoutMethod.update({
            where: { id: next.id },
            data: { isDefault: true },
          });
        }
      }
    });

    // Deletion of a PIX key is a payout-surface change worth auditing —
    // a compromised session that removes a legitimate key to re-add its
    // own is a textbook account-drain prep. Never log the key itself
    // (the whole point of the vault), only the type + the deleted row id.
    await this.auditLog.record({
      actorId: userId,
      action: 'payout_method.delete',
      targetType: 'payout_method',
      targetId: methodId,
      metadata: { type: deletedType ?? 'unknown' },
    });

    return { success: true };
  }

  /**
   * Mark a method as the default. Ownership + demote-others + promote-this
   * all inside one transaction.
   */
  async setDefault(userId: string, methodId: string): Promise<PayoutMethodView> {
    const updated = await this.prisma.$transaction(async (tx) => {
      const method = await tx.payoutMethod.findUnique({ where: { id: methodId } });
      if (!method || method.userId !== userId) {
        throw new NotFoundException('Chave PIX não encontrada.');
      }
      await tx.payoutMethod.updateMany({
        where: { userId, isDefault: true, NOT: { id: methodId } },
        data: { isDefault: false },
      });
      return tx.payoutMethod.update({
        where: { id: methodId },
        data: { isDefault: true },
      });
    });
    return this.toView(updated);
  }

  /**
   * Internal: fetch a method ensuring it belongs to `userId`. Returns the
   * raw row (including the PIX key) — only wallet.service should call this.
   */
  async getOwnedOrThrow(userId: string, methodId: string) {
    const method = await this.prisma.payoutMethod.findUnique({
      where: { id: methodId },
    });
    if (!method || method.userId !== userId) {
      throw new ForbiddenException('Chave PIX não pertence a esta conta.');
    }
    return method;
  }

  private toView(m: {
    id: string;
    type: PixKeyType;
    pixKey: string;
    label: string | null;
    isDefault: boolean;
    createdAt: Date;
  }): PayoutMethodView {
    return {
      id: m.id,
      type: m.type,
      pixKeyMasked: maskPixKey(m.pixKey, m.type),
      label: m.label,
      isDefault: m.isDefault,
      createdAt: m.createdAt,
    };
  }
}
