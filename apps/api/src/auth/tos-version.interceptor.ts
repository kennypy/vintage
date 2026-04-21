import {
  CallHandler,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Observable } from 'rxjs';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Forces authenticated users whose stored `acceptedTosVersion` no longer
 * matches the current `TOS_VERSION` to re-accept before any state-changing
 * request succeeds. Complements the login-time check in AuthService.login
 * — without this, a user with a valid JWT could keep using the app
 * indefinitely after a ToS version bump until their refresh token expired.
 *
 * Scope: only runs on endpoints protected by JwtAuthGuard (req.user set).
 * Skip-listed paths (auth + TOS accept itself) would otherwise create a
 * chicken-and-egg 409 loop. CSRF is NOT a concern here — the interceptor
 * runs after the CSRF middleware, just short-circuits the response.
 *
 * Response shape matches AuthService.login's TOS_UPDATE_REQUIRED for
 * client-side reuse of the re-consent modal.
 */
@Injectable()
export class TosVersionInterceptor implements NestInterceptor {
  private static readonly SKIP_PATHS = new Set([
    '/api/v1/auth/accept-tos',
    '/api/v1/auth/logout',
    '/api/v1/auth/refresh',
    '/api/v1/auth/me',
    '/api/v1/users/me',
  ]);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: { id: string } }>();

    // Only enforce on authenticated requests. Unauthenticated routes
    // (register, login, csrf-token) and unguarded endpoints skip.
    const userId = req.user?.id;
    if (!userId) return next.handle();

    // Never require the reconsent cycle on the endpoint that lets the
    // user actually accept the new version — that would deadlock.
    if (TosVersionInterceptor.SKIP_PATHS.has(req.path)) return next.handle();

    const currentVersion = this.config.get<string>('TOS_VERSION', '1.0.0');
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { acceptedTosVersion: true },
    });
    if (!user) return next.handle(); // deleted mid-request; let downstream 401

    if (user.acceptedTosVersion !== currentVersion) {
      throw new HttpException(
        {
          code: 'TOS_UPDATE_REQUIRED',
          message:
            'É necessário aceitar a nova versão dos Termos de Uso e Política de Privacidade.',
          tosVersion: currentVersion,
        },
        HttpStatus.CONFLICT,
      );
    }

    return next.handle();
  }
}
