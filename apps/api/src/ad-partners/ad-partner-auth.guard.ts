import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

// Attached to the request after successful partner auth
export interface PartnerRequest extends Request {
  partner: { id: string; name: string; canReceiveData: boolean };
}

@Injectable()
export class AdPartnerAuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<PartnerRequest>();
    const rawKey = req.headers['x-partner-key'];

    if (typeof rawKey !== 'string' || rawKey.length < 8) {
      throw new UnauthorizedException('Chave de parceiro inválida.');
    }

    const apiKeyHash = crypto
      .createHash('sha256')
      .update(rawKey)
      .digest('hex');

    const partner = await this.prisma.adPartner.findUnique({
      where: { apiKeyHash },
      select: { id: true, name: true, canReceiveData: true, active: true },
    });

    if (!partner || !partner.active) {
      throw new UnauthorizedException('Parceiro não encontrado ou inativo.');
    }

    req.partner = partner;
    return true;
  }
}
