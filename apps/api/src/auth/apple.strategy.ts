import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface AppleProfile {
  email: string;
  name: string;
  providerId: string;
}

interface AppleIdTokenPayload {
  sub: string;
  email?: string;
  email_verified?: string;
  iss?: string;
  aud?: string;
}

/**
 * Apple Sign In verification service.
 * Verifies Apple identity tokens and extracts user profile.
 * Unlike Google OAuth, Apple uses identity tokens (JWT) posted back.
 */
@Injectable()
export class AppleStrategy {
  private readonly clientId: string;

  constructor(config: ConfigService) {
    this.clientId = config.get<string>('APPLE_CLIENT_ID', '');
  }

  get isConfigured(): boolean {
    return this.clientId.length > 0;
  }

  /**
   * Verify and decode Apple identity token.
   * In production, this should verify the JWT signature against Apple's public keys.
   * For now, decodes the payload and validates basic claims.
   */
  async verifyIdentityToken(
    identityToken: string,
    name?: string,
  ): Promise<AppleProfile> {
    // Decode JWT payload (base64url)
    const parts = identityToken.split('.');
    if (parts.length !== 3) {
      throw new Error('Token Apple inválido');
    }

    const payloadStr = Buffer.from(parts[1], 'base64url').toString('utf-8');
    let payload: AppleIdTokenPayload;
    try {
      payload = JSON.parse(payloadStr) as AppleIdTokenPayload;
    } catch {
      throw new Error('Token Apple inválido');
    }

    // Validate issuer
    if (payload.iss !== 'https://appleid.apple.com') {
      throw new Error('Emissor do token Apple inválido');
    }

    // Validate audience matches our client ID
    if (this.clientId && payload.aud !== this.clientId) {
      throw new Error('Audiência do token Apple inválida');
    }

    const email = payload.email;
    if (!email) {
      throw new Error('Email não disponível na conta Apple');
    }

    return {
      email,
      name: name ?? email.split('@')[0],
      providerId: payload.sub,
    };
  }
}
