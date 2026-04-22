import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { Request } from 'express';

/**
 * Single-key partner auth for the CRM → Vintage support integration.
 *
 * Unlike AdPartnerAuthGuard this is not DB-backed. The CRM is one known
 * external service with one shared key (`CRM_PARTNER_KEY`), so we read it
 * from env and constant-time compare. A missing or blank env var means
 * the endpoint is disabled entirely — any caller is rejected.
 *
 * Keys must be at least 32 chars; shorter values are refused at boot so
 * nobody accidentally deploys with a dev string like "test".
 */
@Injectable()
export class CrmPartnerAuthGuard implements CanActivate {
  private readonly logger = new Logger(CrmPartnerAuthGuard.name);

  constructor(private readonly config: ConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const rawKey = req.headers['x-partner-key'];

    if (typeof rawKey !== 'string' || rawKey.length < 8) {
      throw new UnauthorizedException('Chave de parceiro inválida.');
    }

    const expected = this.config.get<string>('CRM_PARTNER_KEY', '');
    if (!expected || expected.length < 32) {
      // No key configured — endpoint is effectively disabled.
      this.logger.warn('CRM_PARTNER_KEY not configured; /partner/support/* is disabled.');
      throw new UnauthorizedException('Integração CRM não configurada.');
    }

    // Constant-time compare to prevent timing leaks. Both sides hashed
    // first so length differences don't short-circuit the comparison.
    const a = crypto.createHash('sha256').update(rawKey).digest();
    const b = crypto.createHash('sha256').update(expected).digest();
    if (!crypto.timingSafeEqual(a, b)) {
      throw new UnauthorizedException('Chave de parceiro inválida.');
    }

    return true;
  }
}
