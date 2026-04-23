import { Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  private readonly secret: string;

  constructor(private configService: ConfigService) {
    this.secret = this.configService.get<string>('CSRF_SECRET', 'development-csrf-secret');
  }

  use(req: Request, res: Response, next: NextFunction): void {
    // Generate CSRF token if not present
    if (!req.cookies['x-csrf-token']) {
      const token = this.generateToken();
      res.cookie('x-csrf-token', token, {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 86400000,
      });
      res.setHeader('X-CSRF-Token', token);
    }

    const token = req.cookies['x-csrf-token'];
    if (token) {
      res.setHeader('X-CSRF-Token', token);
    }

    next();
  }

  generateToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }
}

export function validateCsrfToken(req: Request): boolean {
  if (req.headers['x-api-key']) return true;

  const headerToken = req.headers['x-csrf-token'] as string;
  const bodyToken = (req.body as any)?._csrf as string;
  const queryToken = (req.query as any)?._csrf as string;

  const token = headerToken || bodyToken || queryToken;
  const cookieToken = req.cookies['x-csrf-token'];

  if (!token || !cookieToken) return false;

  try {
    return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(cookieToken));
  } catch {
    return false;
  }
}
