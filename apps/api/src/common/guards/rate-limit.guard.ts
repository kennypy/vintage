import { Injectable, CanActivate, ExecutionContext, TooManyRequestsException } from '@nestjs/common';
import { Request } from 'express';

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  private buckets = new Map<string, RateLimitBucket>();
  private readonly WINDOW_MS = 60 * 1000; // 1 minute
  private readonly DEFAULT_LIMIT = 60;
  private readonly AUTH_LIMIT = 10;
  private readonly PAYMENT_LIMIT = 5;

  canActivate(context: ExecutionContext): boolean {
    const request: Request = context.switchToHttp().getRequest();
    const ip = (request.ip || request.connection.remoteAddress || '').split(':').pop() || 'unknown';
    const userId = (request.user as any)?.id;
    const key = userId ? `user:${userId}` : `ip:${ip}`;

    let limit = this.DEFAULT_LIMIT;
    if (request.path.includes('/auth/')) limit = this.AUTH_LIMIT;
    if (request.path.includes('/payments/')) limit = this.PAYMENT_LIMIT;

    const now = Date.now();
    let bucket = this.buckets.get(key);

    if (!bucket || now > bucket.resetAt) {
      bucket = { count: 1, resetAt: now + this.WINDOW_MS };
      this.buckets.set(key, bucket);
      return true;
    }

    bucket.count++;

    const remaining = limit - bucket.count;
    (request as any).rateLimit = {
      limit,
      current: bucket.count,
      remaining: Math.max(0, remaining),
      resetAt: bucket.resetAt,
    };

    if (bucket.count > limit) {
      throw new TooManyRequestsException(
        `Rate limit exceeded. Try again in ${Math.ceil((bucket.resetAt - now) / 1000)}s`
      );
    }

    return true;
  }
}
