import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { AuthService, SocialProfile } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { SmsService } from '../sms/sms.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RedisService } from '../common/services/redis.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { CpfVaultService } from '../common/services/cpf-vault.service';
import { MetricsService } from '../metrics/metrics.service';
import { ReferralsService } from '../referrals/referrals.service';

jest.mock('bcrypt');
jest.mock('otplib', () => ({
  TOTP: jest.fn().mockImplementation(() => ({
    verify: jest.fn().mockResolvedValue({ valid: true }),
    generate: jest.fn().mockResolvedValue('123456'),
  })),
  generateSecret: jest.fn().mockReturnValue('MOCKSECRET'),
  generateURI: jest.fn().mockReturnValue('otpauth://totp/mock'),
  NobleCryptoPlugin: jest.fn(),
  ScureBase32Plugin: jest.fn(),
}));
jest.mock('qrcode', () => ({
  toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,mock'),
}));

const mockPrisma = {
  user: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  refreshToken: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
};

const mockJwtService = {
  sign: jest.fn(),
};

const mockConfigService = {
  get: jest.fn((key: string, defaultValue?: string) => {
    if (key === 'TOS_VERSION') return '1.0.0';
    if (key === 'JWT_REFRESH_EXPIRY') return '7d';
    return defaultValue;
  }),
};

const mockEmailService = {
  sendWelcomeEmail: jest.fn(),
};

const mockNotificationsService = {
  createNotification: jest.fn(),
};

const mockRedisService = {
  get: jest.fn(),
  set: jest.fn(),
  setNx: jest.fn(),
  incr: jest.fn(),
  incrWithTtl: jest.fn(),
  expire: jest.fn(),
  del: jest.fn(),
  getDel: jest.fn(),
  decr: jest.fn(),
  isAvailable: jest.fn().mockReturnValue(true),
};

const mockSmsService = {
  sendSms: jest.fn(),
  isConfigured: jest.fn().mockReturnValue(true),
};

describe('AuthService - Social Login', () => {
  let service: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: MetricsService, useValue: { authLoginFailed: { inc: jest.fn() }, authLoginLocked: { inc: jest.fn() }, authRefreshReuse: { inc: jest.fn() }, authCsrfRejected: { inc: jest.fn() }, paymentFlagCreated: { inc: jest.fn() }, webhookSignatureRejected: { inc: jest.fn() }, webhookDuplicate: { inc: jest.fn() }, privacyAudit: { inc: jest.fn() }, orderCreate: { observe: jest.fn() } } },
        { provide: CpfVaultService, useValue: { encrypt: jest.fn((v) => 'ENC(' + v + ')'), decrypt: jest.fn((v) => typeof v === 'string' ? v.replace(/^ENC\(|\)$/g, '') : v), lookupHash: jest.fn((v) => 'HASH(' + v + ')') } },
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: EmailService, useValue: mockEmailService },
        { provide: SmsService, useValue: mockSmsService },
        { provide: NotificationsService, useValue: mockNotificationsService },
        { provide: RedisService, useValue: mockRedisService },
        { provide: AnalyticsService, useValue: { capture: jest.fn() } },
        {
          provide: ReferralsService,
          useValue: {
            generateUniqueCode: jest.fn().mockResolvedValue('TESTCODE'),
            linkReferralAtSignup: jest.fn().mockResolvedValue(undefined),
            creditIfEligible: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('socialLogin', () => {
    const googleProfile: SocialProfile = {
      email: 'maria@gmail.com',
      name: 'Maria Silva',
      avatarUrl: 'https://lh3.googleusercontent.com/photo.jpg',
      providerId: 'google-123',
    };

    it('returns tokens when the user already has THIS provider linked (returning user)', async () => {
      // Post-hardening contract: socialLogin only accepts tokens when the
      // existing user has already linked this provider AND this providerId.
      // That rules out silent OAuth account takeover on accounts that were
      // originally registered with a password.
      const existingUser = {
        id: 'user-1',
        email: 'maria@gmail.com',
        socialProvider: 'google',
        socialProviderId: 'google-123',
        cpfChecksumValid: true,
        cpfIdentityVerified: false,
        avatarUrl: null,
        isBanned: false,
        deletedAt: null,
        acceptedTosAt: new Date(),
        acceptedTosVersion: '1.0.0',
      };
      mockPrisma.user.findUnique
        .mockResolvedValueOnce(existingUser) // check if user exists by email
        // Wave 3B: generateTokens reads tokenVersion to embed in JWT ver claim
        .mockResolvedValueOnce({ tokenVersion: 0 })
        .mockResolvedValueOnce({ id: 'user-1', name: 'Maria Silva', email: 'maria@gmail.com', cpf: null, avatarUrl: null, createdAt: new Date() }); // generateTokensWithUser
      mockJwtService.sign.mockReturnValue('access-token');

      const result = await service.socialLogin('google', googleProfile);

      // Refresh token is opaque random bytes — assert shape, not exact value.
      expect(result).toMatchObject({
        accessToken: 'access-token',
        cpfVerified: true,
        user: expect.objectContaining({ id: 'user-1' }),
      });
      expect(typeof (result as { refreshToken: string }).refreshToken).toBe('string');
      expect((result as { refreshToken: string }).refreshToken.length).toBeGreaterThanOrEqual(60);
      expect(mockPrisma.user.create).not.toHaveBeenCalled();
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('should create new user when email does not exist', async () => {
      mockPrisma.user.findUnique
        .mockResolvedValueOnce(null) // check if user exists by email
        // Wave 3B: generateTokens reads tokenVersion (fresh user: 0)
        .mockResolvedValueOnce({ tokenVersion: 0 })
        .mockResolvedValueOnce({ id: 'new-user-1', name: 'Maria Silva', email: 'maria@gmail.com', cpf: null, avatarUrl: null, createdAt: new Date() }); // generateTokensWithUser
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed_random_password');
      mockPrisma.user.create.mockResolvedValue({
        id: 'new-user-1',
        email: 'maria@gmail.com',
        name: 'Maria Silva',
      });
      mockJwtService.sign.mockReturnValue('access-token');

      const result = await service.socialLogin('google', googleProfile);

      expect(result).toMatchObject({
        accessToken: 'access-token',
        cpfVerified: false,
        user: { id: 'new-user-1', name: 'Maria Silva', email: 'maria@gmail.com', cpf: null, avatarUrl: null, createdAt: expect.any(Date) },
      });
      expect(typeof (result as { refreshToken: string }).refreshToken).toBe('string');
      expect((result as { refreshToken: string }).refreshToken.length).toBeGreaterThanOrEqual(60);
      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: 'maria@gmail.com',
          name: 'Maria Silva',
          socialProvider: 'google',
          socialProviderId: 'google-123',
          // auth.service.ts writes `cpfChecksumValid: false` on
          // first OAuth signup. cpfIdentityVerified is not passed
          // and defaults to false in the schema.
          cpfChecksumValid: false,
          wallet: { create: {} },
        }),
      });
      expect(mockEmailService.sendWelcomeEmail).toHaveBeenCalledWith(
        'maria@gmail.com',
        'Maria Silva',
      );
    });

    it('surfaces cpfVerified=false on the wire for a brand-new OAuth signup (no CPF yet)', async () => {
      mockPrisma.user.findUnique
        .mockResolvedValueOnce(null) // check if user exists
        .mockResolvedValueOnce({ tokenVersion: 0 }) // Wave 3B: generateTokens ver read
        .mockResolvedValueOnce({ id: 'new-user-1', name: 'Maria Silva', email: 'maria@apple.com', cpf: null, avatarUrl: null, createdAt: new Date() }); // generateTokensWithUser
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed_random_password');
      mockPrisma.user.create.mockResolvedValue({
        id: 'new-user-1',
        email: 'maria@apple.com',
        name: 'Maria Silva',
      });
      mockJwtService.sign.mockReturnValue('access-token');

      const result = await service.socialLogin('apple', {
        email: 'maria@apple.com',
        name: 'Maria Silva',
        providerId: 'apple-123',
      });

      expect(result.cpfVerified).toBe(false);
      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          cpfChecksumValid: false,
          socialProvider: 'apple',
          socialProviderId: 'apple-123',
        }),
      });
    });

    it('refuses to silently link a social provider onto an existing password account', async () => {
      // This is the headline security fix: if someone registered
      // maria@gmail.com with a password, a later "Sign in with Google"
      // using the same email must NOT be accepted as if it were the same
      // user. The link flow is now explicit and password-gated via
      // /auth/link-social — socialLogin refuses the merge with 409.
      const existingUser = {
        id: 'user-1',
        email: 'maria@gmail.com',
        socialProvider: null,
        socialProviderId: null,
        cpfChecksumValid: true,
        cpfIdentityVerified: false,
        avatarUrl: null,
        isBanned: false,
        deletedAt: null,
        acceptedTosAt: new Date(),
        acceptedTosVersion: '1.0.0',
      };
      mockPrisma.user.findUnique.mockResolvedValue(existingUser);

      await expect(
        service.socialLogin('google', googleProfile),
      ).rejects.toThrow(ConflictException);

      // Critical: no update should happen, no tokens should be minted.
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
      expect(mockPrisma.user.create).not.toHaveBeenCalled();
      expect(mockJwtService.sign).not.toHaveBeenCalled();
    });

    it('refuses when the existing user has a DIFFERENT provider already linked', async () => {
      // Pin that an Apple user can't be walked into by someone presenting
      // a Google token for the same email. Same error class, same
      // defensive posture.
      const existingUser = {
        id: 'user-1',
        email: 'maria@gmail.com',
        socialProvider: 'apple',
        socialProviderId: 'apple-xyz',
        cpfChecksumValid: true,
        cpfIdentityVerified: false,
        avatarUrl: null,
        isBanned: false,
        deletedAt: null,
        acceptedTosAt: new Date(),
        acceptedTosVersion: '1.0.0',
      };
      mockPrisma.user.findUnique.mockResolvedValue(existingUser);

      await expect(
        service.socialLogin('google', googleProfile),
      ).rejects.toThrow(ConflictException);
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
      expect(mockJwtService.sign).not.toHaveBeenCalled();
    });
  });

  describe('linkSocialProvider (authenticated link flow)', () => {
    const googleProfile: SocialProfile = {
      email: 'maria@gmail.com',
      name: 'Maria Silva',
      avatarUrl: 'https://example.com/a.jpg',
      providerId: 'google-123',
    };

    it('links when password matches and no provider yet', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: 'user-1',
        email: 'maria@gmail.com',
        passwordHash: 'hashed',
        socialProvider: null,
        socialProviderId: null,
        avatarUrl: null,
        deletedAt: null,
      });
      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(true);
      mockPrisma.user.update.mockResolvedValueOnce({});

      const result = await service.linkSocialProvider(
        'user-1',
        'correct-password',
        'google',
        googleProfile,
      );

      expect(result).toEqual({ success: true, provider: 'google' });
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: {
          socialProvider: 'google',
          socialProviderId: 'google-123',
          avatarUrl: 'https://example.com/a.jpg',
        },
      });
    });

    it('refuses when password is wrong', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: 'user-1',
        email: 'maria@gmail.com',
        passwordHash: 'hashed',
        socialProvider: null,
        socialProviderId: null,
        avatarUrl: null,
        deletedAt: null,
      });
      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(false);

      await expect(
        service.linkSocialProvider('user-1', 'wrong', 'google', googleProfile),
      ).rejects.toThrow();
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('refuses when the social email does not match the account email', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: 'user-1',
        email: 'maria@gmail.com',
        passwordHash: 'hashed',
        socialProvider: null,
        socialProviderId: null,
        avatarUrl: null,
        deletedAt: null,
      });
      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(true);

      await expect(
        service.linkSocialProvider('user-1', 'correct', 'google', {
          ...googleProfile,
          email: 'attacker@gmail.com',
        }),
      ).rejects.toThrow();
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });
  });
});
