import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Request } from 'express';
import { validateCsrfToken } from '../middleware/csrf.middleware';

@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request: Request = context.switchToHttp().getRequest();

    // Only validate on state-changing requests
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
      return true;
    }

    // Skip CSRF for webhooks (they use signature verification instead)
    if (request.path.includes('/webhooks/') || request.path.includes('/webhook')) {
      return true;
    }

    if (!validateCsrfToken(request)) {
      throw new ForbiddenException('CSRF token validation failed');
    }

    return true;
  }
}
