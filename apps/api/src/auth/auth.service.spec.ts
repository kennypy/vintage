import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { SmsService } from '../sms/sms.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RedisService } from '../common/services/redis.service';

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
jest.mock('@vintage/shared', () => ({
  isValidCPF: jest.fn(),
}));

import { isValidCPF } from '@vintage/shared';

const mockPrisma = {
  user: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  loginEvent: {
    create: jest.fn(),
  },
};

const mockJwtService = {
  sign: jest.fn(),
  verify: jest.fn(),
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
  sendEmailChangeConfirmation: jest.fn(),
  sendEmailChangeNoticeToOld: jest.fn(),
};

const mockSmsService = {
  sendSms: jest.fn(),
  isConfigured: jest.fn().mockReturnValue(true),
};

const mockNotificationsService = {
  createNotification: jest.fn(),
};

const mockRedisService = {
  get: jest.fn(),
  set: jest.fn(),
  setNx: jest.fn().mockResolvedValue(true),
  incr: jest.fn(),
  incrWithTtl: jest.fn().mockResolvedValue(1),
  expire: jest.fn(),
  del: jest.fn(),
  getDel: jest.fn(),
  decr: jest.fn(),
  isAvailable: jest.fn().mockReturnValue(true),
};

describe('AuthService', () => {
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
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('register', () => {
    const registerDto = {
      email: 'test@example.com',
      password: 'StrongPass123!',
      cpf: '529.982.247-25',
      name: 'Maria Silva',
      phone: '+5511999999999',
      acceptedTos: true,
      tosVersion: '1.0.0',
    };

    it('should create user with hashed password, create wallet, and return tokens', async () => {
      (isValidCPF as jest.Mock).mockReturnValue(true);
      mockPrisma.user.findFirst.mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed_password');
      mockPrisma.user.create.mockResolvedValue({ id: 'user-1', email: 'test@example.com', name: 'Maria Silva' });
      mockJwtService.sign
        .mockReturnValueOnce('access-token')
        .mockReturnValueOnce('refresh-token');

      const result = await service.register(registerDto);

      expect(isValidCPF).toHaveBeenCalledWith('52998224725');
      expect(bcrypt.hash).toHaveBeenCalledWith('StrongPass123!', 12);
      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: 'test@example.com',
          passwordHash: 'hashed_password',
          cpf: '52998224725',
          name: 'Maria Silva',
          phone: '+5511999999999',
          wallet: { create: {} },
        }),
      });
      expect(result).toMatchObject({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });
    });

    it('should reject duplicate email or CPF', async () => {
      (isValidCPF as jest.Mock).mockReturnValue(true);
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'existing-user' });

      await expect(service.register(registerDto)).rejects.toThrow(
        ConflictException,
      );
      await expect(service.register(registerDto)).rejects.toThrow(
        'Email ou CPF já cadastrado',
      );
    });

    it('should reject invalid CPF', async () => {
      (isValidCPF as jest.Mock).mockReturnValue(false);

      await expect(service.register(registerDto)).rejects.toThrow(
        ConflictException,
      );
      await expect(service.register(registerDto)).rejects.toThrow(
        'CPF inválido',
      );
    });
  });

  describe('login', () => {
    const loginDto = {
      email: 'test@example.com',
      password: 'StrongPass123!',
    };

    it('should return tokens for valid credentials', async () => {
      const mockUser = {
        id: 'user-1',
        passwordHash: 'hashed_password',
        name: 'Test',
        email: 'test@example.com',
        cpf: '52998224725',
        avatarUrl: null,
        createdAt: new Date(),
        isBanned: false,
        deletedAt: null,
        twoFaEnabled: false,
        acceptedTosAt: new Date(),
        acceptedTosVersion: '1.0.0',
      };
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockJwtService.sign
        .mockReturnValueOnce('access-token')
        .mockReturnValueOnce('refresh-token');

      const result = await service.login(loginDto);

      expect(result).toMatchObject({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });
      expect(result).toHaveProperty('user');
    });

    it('should reject invalid password', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        passwordHash: 'hashed_password',
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.login(loginDto)).rejects.toThrow(
        'Email ou senha inválidos',
      );
    });

    it('should reject non-existent email', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.login(loginDto)).rejects.toThrow(
        'Email ou senha inválidos',
      );
    });
  });

  describe('refreshToken', () => {
    it('should return new tokens for valid refresh token', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'user-1', type: 'refresh' });
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
      mockJwtService.sign
        .mockReturnValueOnce('new-access-token')
        .mockReturnValueOnce('new-refresh-token');

      const result = await service.refreshToken('valid-refresh-token');

      expect(mockJwtService.verify).toHaveBeenCalledWith('valid-refresh-token');
      expect(result).toEqual({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      });
    });

    it('should reject if token type is not refresh', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'user-1' }); // access token — no type

      await expect(service.refreshToken('access-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should reject if user not found', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'nonexistent', type: 'refresh' });
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.refreshToken('valid-refresh-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // ── SMS 2FA ──────────────────────────────────────────────────────────
  // Tests focus on the branches that were most at risk in review:
  // atomic consume, uniform error messages, rate limiting, and counter refund.

  describe('confirmLoginWithTwoFa — SMS path', () => {
    beforeEach(() => {
      mockJwtService.verify.mockReturnValue({ sub: 'user-1', type: 'twofa_pending' });
      mockRedisService.get.mockResolvedValue(null); // no 2FA lock
    });

    it('uses GETDEL (single-use) when verifying an SMS code', async () => {
      const crypto = jest.requireActual<typeof import('crypto')>('crypto');
      const plaintext = '123456';
      const hash = crypto.createHash('sha256').update(plaintext).digest('hex');
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        twoFaEnabled: true,
        twoFaMethod: 'SMS',
        twoFaSecret: null,
      });
      mockRedisService.getDel.mockResolvedValueOnce(hash);
      mockJwtService.sign
        .mockReturnValueOnce('access-token')
        .mockReturnValueOnce('refresh-token');

      const result = await service.confirmLoginWithTwoFa('tmp', plaintext);

      expect(mockRedisService.getDel).toHaveBeenCalledWith('auth:2fa:sms:code:user-1');
      // Second concurrent call should fail (getDel returns null after the first).
      mockRedisService.getDel.mockResolvedValueOnce(null);
      await expect(service.confirmLoginWithTwoFa('tmp', plaintext)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(result).toMatchObject({ accessToken: 'access-token' });
    });

    it('returns the UNIFORM error for invalid SMS code (no user-state leak)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        twoFaEnabled: true,
        twoFaMethod: 'SMS',
      });
      mockRedisService.getDel.mockResolvedValueOnce(null); // expired/missing

      await expect(service.confirmLoginWithTwoFa('tmp', '000000')).rejects.toThrow(
        'Código ou token inválido.',
      );
    });

    it('returns the UNIFORM error when the user has no 2FA configured', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        twoFaEnabled: false,
        twoFaMethod: 'TOTP',
      });

      await expect(service.confirmLoginWithTwoFa('tmp', '123456')).rejects.toThrow(
        'Código ou token inválido.',
      );
    });

    it('returns the UNIFORM error when tempToken is of the wrong type', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'user-1', type: 'refresh' });

      await expect(service.confirmLoginWithTwoFa('tmp', '123456')).rejects.toThrow(
        'Código ou token inválido.',
      );
    });
  });

  describe('setupSms2Fa', () => {
    it('rejects invalid E.164 phone numbers', async () => {
      await expect(service.setupSms2Fa('user-1', '11999998888')).rejects.toThrow(
        'E.164',
      );
    });

    it('rejects when 2FA is already enabled', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        twoFaEnabled: true,
      });

      await expect(
        service.setupSms2Fa('user-1', '+5511999998888'),
      ).rejects.toThrow('Desative o 2FA atual');
    });

    it('sends OTP and returns a masked phone hint on success', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        twoFaEnabled: false,
      });
      mockPrisma.user.update.mockResolvedValue({});
      mockRedisService.get.mockResolvedValue(null);
      mockRedisService.incrWithTtl.mockResolvedValue(1);
      mockSmsService.sendSms.mockResolvedValue(undefined);

      const result = await service.setupSms2Fa('user-1', '+5511999998888');

      expect(mockSmsService.sendSms).toHaveBeenCalledTimes(1);
      expect(result.phoneHint).toMatch(/•{4}8888$/);
    });

    it('refunds the send counter when Twilio fails (failed send does not count)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        twoFaEnabled: false,
      });
      mockPrisma.user.update.mockResolvedValue({});
      mockRedisService.get.mockResolvedValue(null);
      mockRedisService.incrWithTtl.mockResolvedValue(1);
      mockSmsService.sendSms.mockRejectedValue(new Error('twilio down'));

      await expect(
        service.setupSms2Fa('user-1', '+5511999998888'),
      ).rejects.toThrow('Não foi possível enviar');

      expect(mockRedisService.del).toHaveBeenCalledWith('auth:2fa:sms:code:user-1');
      expect(mockRedisService.decr).toHaveBeenCalledWith('auth:2fa:sms:sends:user-1');
    });

    it('blocks sending when the per-user hourly ceiling is reached', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        twoFaEnabled: false,
      });
      mockPrisma.user.update.mockResolvedValue({});
      mockRedisService.get.mockResolvedValue(null);
      mockRedisService.incrWithTtl.mockResolvedValue(6); // > SMS_MAX_SENDS_PER_HOUR (5)

      await expect(
        service.setupSms2Fa('user-1', '+5511999998888'),
      ).rejects.toThrow('Limite de envios');

      expect(mockSmsService.sendSms).not.toHaveBeenCalled();
    });

    it('fails closed in production when Redis is unavailable', async () => {
      mockConfigService.get.mockImplementationOnce((key: string) =>
        key === 'NODE_ENV' ? 'production' : undefined,
      );
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        twoFaEnabled: false,
      });
      mockPrisma.user.update.mockResolvedValue({});
      mockRedisService.isAvailable.mockReturnValueOnce(false);

      await expect(
        service.setupSms2Fa('user-1', '+5511999998888'),
      ).rejects.toThrow('indisponível');

      expect(mockSmsService.sendSms).not.toHaveBeenCalled();
    });
  });

  describe('enableSms2Fa', () => {
    beforeEach(() => {
      mockRedisService.get.mockResolvedValue(null);
    });

    it('flips twoFaEnabled/Method only when the SMS code verifies', async () => {
      const crypto = jest.requireActual<typeof import('crypto')>('crypto');
      const code = '654321';
      const hash = crypto.createHash('sha256').update(code).digest('hex');
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        twoFaEnabled: false,
        twoFaPhone: '+5511999998888',
      });
      mockRedisService.getDel.mockResolvedValueOnce(hash);

      await service.enableSms2Fa('user-1', code);

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: expect.objectContaining({
            twoFaEnabled: true,
            twoFaMethod: 'SMS',
            twoFaSecret: null,
          }),
        }),
      );
    });

    it('rejects when the enrollment phone was never set', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        twoFaEnabled: false,
        twoFaPhone: null,
      });

      await expect(service.enableSms2Fa('user-1', '123456')).rejects.toThrow(
        'setup',
      );
    });
  });
});
