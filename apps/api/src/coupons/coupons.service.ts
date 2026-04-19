import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { CreateCouponDto } from './dto/create-coupon.dto';

export interface CouponValidationResult {
  valid: boolean;
  couponId: string;
  code: string;
  discountPct: number;
  discountBrl: number;
}

@Injectable()
export class CouponsService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
  ) {}

  async validate(code: string, orderTotal: number): Promise<CouponValidationResult> {
    const coupon = await this.prisma.coupon.findUnique({
      where: { code: code.toUpperCase().trim() },
    });

    if (!coupon) {
      throw new NotFoundException('Cupom não encontrado');
    }

    if (!coupon.isActive) {
      throw new BadRequestException('Este cupom não está mais ativo');
    }

    if (coupon.expiresAt && coupon.expiresAt < new Date()) {
      throw new BadRequestException('Este cupom está expirado');
    }

    if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
      throw new BadRequestException('Este cupom atingiu o limite de usos');
    }

    const discountBrl = Math.min(
      parseFloat(((orderTotal * coupon.discountPct) / 100).toFixed(2)),
      orderTotal,
    );

    return {
      valid: true,
      couponId: coupon.id,
      code: coupon.code,
      discountPct: coupon.discountPct,
      discountBrl,
    };
  }

  async create(dto: CreateCouponDto, actorId: string | null = null) {
    const existing = await this.prisma.coupon.findUnique({
      where: { code: dto.code.toUpperCase().trim() },
    });

    if (existing) {
      throw new BadRequestException('Já existe um cupom com este código');
    }

    const coupon = await this.prisma.coupon.create({
      data: {
        code: dto.code.toUpperCase().trim(),
        discountPct: dto.discountPct,
        maxUses: dto.maxUses ?? null,
        expiresAt: dto.expiresAt ?? null,
        isActive: dto.isActive ?? true,
      },
    });
    await this.auditLog.record({
      actorId,
      action: 'coupon.create',
      targetType: 'coupon',
      targetId: coupon.id,
      metadata: {
        code: coupon.code,
        discountPct: coupon.discountPct,
        maxUses: coupon.maxUses,
      },
    });
    return coupon;
  }
}
