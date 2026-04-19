import {
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

export interface AppleProfile {
  email: string;
  name: string;
  providerId: string;
}

/**
 * Apple's published JWKS endpoint. Keys rotate; jose caches them in-process
 * (default TTL is jose-internal) and fetches on cache miss.
 */
const APPLE_JWKS_URL = new URL('https://appleid.apple.com/auth/keys');
const APPLE_ISSUER = 'https://appleid.apple.com';

/**
 * How far we let the server clock drift from Apple's `iat` before refusing a
 * token. 30s matches standard OAuth practice — long enough to survive NTP
 * jitter, short enough that a stolen token doesn't survive a long replay.
 */
const CLOCK_TOLERANCE_SECONDS = 30;

interface AppleIdTokenPayload extends JWTPayload {
  email?: string;
  email_verified?: string | boolean;
  iss?: string;
  aud?: string | string[];
  sub?: string;
}

/**
 * Apple Sign In identity-token verifier.
 *
 * Before this rewrite, verifyIdentityToken ONLY decoded the JWT and trusted
 * payload.email — no signature check against Apple's public keys. An attacker
 * could forge a token with iss=https://appleid.apple.com + any email and
 * take over the matching Vintage account. Worse, the audience check
 * `if (this.clientId && payload.aud !== this.clientId)` silently skipped
 * when APPLE_CLIENT_ID was unset (our current .env.example default), so even
 * a misconfigured deployment accepted arbitrary forged tokens.
 *
 * This version:
 *   - Requires APPLE_CLIENT_ID to be configured; refuses to verify otherwise.
 *   - Verifies the RS256 signature against Apple's JWKS.
 *   - Pins issuer to https://appleid.apple.com.
 *   - Enforces aud == APPLE_CLIENT_ID (no silent skip).
 *   - Lets jose enforce exp / iat / nbf with a bounded clock tolerance.
 */
@Injectable()
export class AppleStrategy {
  private readonly logger = new Logger(AppleStrategy.name);
  private readonly clientId: string;
  // Lazily initialised so a deployment that never uses Apple Sign In isn't
  // forced to reach Apple on boot. createRemoteJWKSet returns a callable
  // that caches fetched keys and rotates on kid miss.
  private jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

  constructor(config: ConfigService) {
    this.clientId = config.get<string>('APPLE_CLIENT_ID', '');
  }

  get isConfigured(): boolean {
    return this.clientId.length > 0;
  }

  private getJwks() {
    if (!this.jwks) {
      this.jwks = createRemoteJWKSet(APPLE_JWKS_URL);
    }
    return this.jwks;
  }

  async verifyIdentityToken(
    identityToken: string,
    name?: string,
  ): Promise<AppleProfile> {
    if (!this.clientId) {
      // Misconfiguration, not user error. Surface as 500 so ops notice in
      // logs — users can still sign in via Google or email/password. Silent
      // acceptance is the failure mode we are specifically defending against.
      this.logger.error(
        'APPLE_CLIENT_ID is not set — refusing to verify Apple identity tokens.',
      );
      throw new InternalServerErrorException(
        'Apple Sign In não está configurado no servidor.',
      );
    }

    let payload: AppleIdTokenPayload;
    try {
      const result = await jwtVerify(identityToken, this.getJwks(), {
        issuer: APPLE_ISSUER,
        audience: this.clientId,
        algorithms: ['RS256'],
        clockTolerance: CLOCK_TOLERANCE_SECONDS,
      });
      payload = result.payload as AppleIdTokenPayload;
    } catch (err) {
      // jose throws specific error codes for each failure class (expired,
      // invalid signature, issuer mismatch, audience mismatch, etc). Collapse
      // them all to a single UX message so we don't leak which check failed.
      this.logger.warn(
        `Apple identity token rejected: ${String(err).slice(0, 200)}`,
      );
      throw new UnauthorizedException('Token Apple inválido ou expirado');
    }

    const sub = typeof payload.sub === 'string' ? payload.sub : '';
    const email = typeof payload.email === 'string' ? payload.email : '';

    if (!sub) {
      throw new UnauthorizedException('Token Apple sem identificador de usuário');
    }
    if (!email) {
      // Apple omits email on subsequent sign-ins unless the user selected
      // "share email". First-time sign-ins always include it. If email is
      // missing, the client should prompt the user — we refuse to create
      // an account without one.
      throw new UnauthorizedException('Email não disponível na conta Apple');
    }

    return {
      email,
      name: name ?? email.split('@')[0],
      providerId: sub,
    };
  }
}
