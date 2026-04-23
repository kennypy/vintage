import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request } from 'express';

interface CacheEntry {
  data: unknown;
  expiresAt: number;
}

@Injectable()
export class CacheInterceptor implements NestInterceptor {
  private cache = new Map<string, CacheEntry>();

  private getCacheTtl(path: string): number | null {
    const ttl: Record<string, number> = {
      '/listings/feed': 5 * 60 * 1000,
      '/listings/': 5 * 60 * 1000,
      '/search/': 2 * 60 * 1000,
      '/users/': 10 * 60 * 1000,
      '/reviews/': 10 * 60 * 1000,
    };

    for (const [pattern, duration] of Object.entries(ttl)) {
      if (path.includes(pattern)) return duration;
    }

    return null;
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request: Request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    if (request.method !== 'GET') {
      return next.handle();
    }

    const cacheKey = `${request.method}:${request.url}`;
    const ttl = this.getCacheTtl(request.path);

    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      response.setHeader('X-Cache', 'HIT');
      return of(cached.data);
    }

    return next.handle().pipe(
      tap((data) => {
        if (ttl && data) {
          this.cache.set(cacheKey, {
            data,
            expiresAt: Date.now() + ttl,
          });
          response.setHeader('X-Cache', 'MISS');
        }
      }),
    );
  }
}
