import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';

export interface GoogleProfile {
  email: string;
  name: string;
  avatarUrl?: string;
  providerId: string;
}

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(config: ConfigService) {
    const nodeEnv = config.get<string>('NODE_ENV', 'development');
    const isDev = nodeEnv !== 'production';
    // Dev-only fallback for API URL — production MUST set GOOGLE_CALLBACK_URL or API_URL.
    const apiUrlFallback = isDev ? 'http://localhost:3001' : '';
    // Dev-only fallback for client credentials so the API boots on fresh
    // local machines that haven't provisioned a Google OAuth app yet.
    // Attempting the Google flow with these values will fail at Google —
    // but email/password login is unaffected, which is what matters for
    // local dev. Production uses an empty fallback so passport-google-oauth20
    // throws and we fail fast instead of booting with bogus creds.
    const credentialFallback = isDev ? 'dev-noop' : '';
    super({
      clientID: config.get<string>('GOOGLE_CLIENT_ID') || credentialFallback,
      clientSecret: config.get<string>('GOOGLE_CLIENT_SECRET') || credentialFallback,
      callbackURL: config.get<string>(
        'GOOGLE_CALLBACK_URL',
        `${config.get<string>('API_URL', apiUrlFallback)}/api/v1/auth/google/callback`,
      ),
      scope: ['email', 'profile'],
    });
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: {
      id: string;
      emails?: Array<{ value: string }>;
      displayName?: string;
      photos?: Array<{ value: string }>;
    },
    done: VerifyCallback,
  ): void {
    const email = profile.emails?.[0]?.value;
    if (!email) {
      done(new Error('Email não disponível na conta Google'), undefined);
      return;
    }

    const googleProfile: GoogleProfile = {
      email,
      name: profile.displayName ?? email.split('@')[0],
      avatarUrl: profile.photos?.[0]?.value,
      providerId: profile.id,
    };

    done(null, googleProfile);
  }
}
