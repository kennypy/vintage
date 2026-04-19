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
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: EmailService, useValue: mockEmailService },
        { provide: SmsService, useValue: mockSmsService },
        { provide: NotificationsService, useValue: mockNotificationsService },
        { provide: RedisService, useValue: mockRedisService },
        { provide: AnalyticsService, useValue: { capture: jest.fn() } },
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

    it('should return tokens when user with email already exists', async () => {
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
      mockJwtService.sign
        .mockReturnValueOnce('access-token')
        .mockReturnValueOnce('refresh-token');

      const result = await service.socialLogin('google', googleProfile);

      expect(result).toEqual({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        cpfVerified: true,
        user: expect.objectContaining({ id: 'user-1' }),
      });
      expect(mockPrisma.user.create).not.toHaveBeenCalled();
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
      mockJwtService.sign
        .mockReturnValueOnce('access-token')
        .mockReturnValueOnce('refresh-token');

      const result = await service.socialLogin('google', googleProfile);

      expect(result).toEqual({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        cpfVerified: false,
        user: { id: 'new-user-1', name: 'Maria Silva', email: 'maria@gmail.com', cpf: null, avatarUrl: null, createdAt: expect.any(Date) },
      });
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
      mockJwtService.sign
        .mockReturnValueOnce('access-token')
        .mockReturnValueOnce('refresh-token');

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

    it('should update social provider info for existing user without social provider', async () => {
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
      mockJwtService.sign
        .mockReturnValueOnce('access-token')
        .mockReturnValueOnce('refresh-token');

      await service.socialLogin('google', googleProfile);

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: {
          socialProvider: 'google',
          socialProviderId: 'google-123',
          avatarUrl: 'https://lh3.googleusercontent.com/photo.jpg',
        },
      });
    });
  });
});
