import {
  Injectable,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AuthUser } from '../decorators/current-user.decorator';

/**
 * Guard that extends JWT authentication to also require ADMIN role.
 * Apply with @UseGuards(AdminGuard) on admin-only endpoints.
 */
@Injectable()
export class AdminGuard extends JwtAuthGuard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    // First run JWT auth (sets req.user)
    await super.canActivate(context);

    const request = context.switchToHttp().getRequest<{ user: AuthUser }>();
    if (request.user?.role !== 'ADMIN') {
      throw new ForbiddenException('Acesso restrito a administradores.');
    }
    return true;
  }
}
