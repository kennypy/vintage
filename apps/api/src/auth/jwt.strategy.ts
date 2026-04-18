import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private prisma: PrismaService,
  ) {
    // passport-jwt@4.x stricter typing: secretOrKey must be string | Buffer,
    // never `string | undefined`. main.ts guarantees JWT_SECRET in prod;
    // fall back to an obviously-wrong value for dev so a forgotten env
    // var is loud instead of silent.
    const secret = config.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error('JWT_SECRET is required');
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: { sub: string; type?: string; ver?: number }) {
    // Reject non-access tokens — refresh and 2FA tokens must not be
    // usable as access tokens on regular endpoints.
    if (payload.type === 'refresh' || payload.type === 'twofa_pending') {
      throw new UnauthorizedException('Token type not accepted for this endpoint');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        name: true,
        verified: true,
        role: true,
        isBanned: true,
        tokenVersion: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException();
    }

    if (user.isBanned) {
      throw new UnauthorizedException('Sua conta foi suspensa. Entre em contato com o suporte.');
    }

    // tokenVersion mismatch means the token was issued before an event
    // that must globally invalidate sessions (email change, password
    // change, admin force-logout). Tokens minted before the bump carry
    // an older `ver` and are rejected here even though they haven't
    // expired. Legacy tokens without `ver` at all are treated as stale
    // — no grace window — so an upgrade doesn't silently accept them.
    if (typeof payload.ver !== 'number' || payload.ver !== user.tokenVersion) {
      throw new UnauthorizedException('Session invalidated. Sign in again.');
    }

    const { tokenVersion: _ignored, ...rest } = user;
    return rest;
  }
}
