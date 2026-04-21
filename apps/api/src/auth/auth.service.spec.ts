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
jest.mock('@vintage/shared', () => ({
  isValidCPF: jest.fn(),
}));

import { isValidCPF } from '@vintage/shared';
import { CpfVaultService } from '../common/services/cpf-vault.service';
import { MetricsService } from '../metrics/metrics.service';

const mockPrisma = {
  user: {
    findFirst: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  fraudFlag: {
    create: jest.fn().mockResolvedValue({}),
  },
  loginEvent: {
    create: jest.fn(),
  },
  emailVerificationToken: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  refreshToken: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    deleteMany: jest.fn(),
  },
  $transaction: jest.fn().mockImplementation((argsOrCb: unknown) => {
    if (typeof argsOrCb === 'function') {
      // Pass a tx that defaults to the same mockPrisma surface — tests that
      // care about specific tx behaviour override the callback.
      return (argsOrCb as (tx: typeof mockPrisma) => unknown)(mockPrisma);
    }
    return Promise.all(argsOrCb as unknown[]);
  }),
  passwordResetToken: {
    updateMany: jest.fn(),
    findUnique: jest.fn(),
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
      birthDate: '1990-01-15',
      acceptedTos: true,
      tosVersion: '1.0.0',
    };

    it('should create user with hashed password, create wallet, and return tokens', async () => {
      (isValidCPF as jest.Mock).mockReturnValue(true);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed_password');
      mockPrisma.user.create.mockResolvedValue({ id: 'user-1', email: 'test@example.com', name: 'Maria Silva' });
      // CPF-at-rest changed the register-path reads: CPF is now a
      // findUnique on cpfLookupHash, followed by the email findUnique,
      // then generateTokens reads tokenVersion, then
      // generateTokensWithUser reads the full row.
      mockPrisma.user.findUnique
        .mockResolvedValueOnce(null) // cpfLookupHash uniqueness — clear
        .mockResolvedValueOnce(null) // email uniqueness — clear
        .mockResolvedValue({
          id: 'user-1', name: 'Maria Silva', email: 'test@example.com',
          cpfEncrypted: 'ENC(52998224725)', cpfLookupHash: 'HASH(52998224725)', avatarUrl: null, createdAt: new Date(),
          tokenVersion: 0,
        });
      mockJwtService.sign.mockReturnValue('access-token');

      const result = await service.register(registerDto);

      expect(isValidCPF).toHaveBeenCalledWith('52998224725');
      expect(bcrypt.hash).toHaveBeenCalledWith('StrongPass123!', 12);
      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: 'test@example.com',
          passwordHash: 'hashed_password',
          cpfEncrypted: 'ENC(52998224725)', cpfLookupHash: 'HASH(52998224725)',
          name: 'Maria Silva',
          // Phone is normalised to digits-only at create time.
          phone: '5511999999999',
          wallet: { create: {} },
        }),
      });
      // Access token is the JWT; refresh token is an opaque 64-char
      // base64url string (see generateTokens — it's no longer a JWT
      // envelope). Assert shape, not an exact mock string.
      expect(result.accessToken).toBe('access-token');
      expect(typeof result.refreshToken).toBe('string');
      expect(result.refreshToken.length).toBeGreaterThanOrEqual(60);
    });

    it('should reject duplicate CPF', async () => {
      (isValidCPF as jest.Mock).mockReturnValue(true);
      // CPF lookup (first findUnique) returns an existing row.
      mockPrisma.user.findUnique.mockResolvedValueOnce({ id: 'existing-user' });

      await expect(service.register(registerDto)).rejects.toThrow(
        ConflictException,
      );
      await expect(service.register(registerDto)).rejects.toThrow(
        'Email ou CPF já cadastrado',
      );
    });

    it('should reject duplicate email when the existing record is verified', async () => {
      (isValidCPF as jest.Mock).mockReturnValue(true);
      mockPrisma.user.findUnique
        .mockResolvedValueOnce(null) // cpfLookupHash uniqueness — clear
        .mockResolvedValueOnce({
        id: 'existing-user',
        email: 'test@example.com',
        emailVerifiedAt: new Date(),
        socialProvider: null,
        deletedAt: null,
      });

      await expect(service.register(registerDto)).rejects.toThrow(
        ConflictException,
      );
      expect(mockPrisma.user.delete).not.toHaveBeenCalled();
    });

    it('overwrites an unverified squatter so the real owner can claim the email', async () => {
      // Anti-squatting: an account that was created but never verified
      // is not yet "owned" by anyone. Wiping it lets the real email
      // owner register normally instead of being permanently locked
      // out by an attacker who registered first.
      (isValidCPF as jest.Mock).mockReturnValue(true);
      mockPrisma.user.findUnique
        .mockResolvedValueOnce(null) // cpfLookupHash uniqueness — clear
        .mockResolvedValueOnce({
          id: 'squatter-1',
          email: 'test@example.com',
          emailVerifiedAt: null,
          socialProvider: null,
          deletedAt: null,
        })
        .mockResolvedValue({
          id: 'real-user-1',
          name: 'Maria Silva',
          email: 'test@example.com',
          cpfEncrypted: 'ENC(52998224725)', cpfLookupHash: 'HASH(52998224725)',
          avatarUrl: null,
          createdAt: new Date(),
          tokenVersion: 0,
        });
      mockPrisma.user.delete.mockResolvedValue({ id: 'squatter-1' });
      (bcrypt.hash as jest.Mock).mockResolvedValue('hash');
      mockPrisma.user.create.mockResolvedValue({
        id: 'real-user-1',
        email: 'test@example.com',
        name: 'Maria Silva',
      });
      mockJwtService.sign.mockReturnValue('access-token');

      await service.register(registerDto);

      expect(mockPrisma.user.delete).toHaveBeenCalledWith({ where: { id: 'squatter-1' } });
      expect(mockPrisma.user.create).toHaveBeenCalled();
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
        cpfEncrypted: 'ENC(52998224725)', cpfLookupHash: 'HASH(52998224725)',
        avatarUrl: null,
        createdAt: new Date(),
        isBanned: false,
        deletedAt: null,
        twoFaEnabled: false,
        acceptedTosAt: new Date(),
        acceptedTosVersion: '1.0.0',
        // Email-ownership gate: login refuses unverified accounts.
        // Set a non-null timestamp so this test exercises the happy path.
        emailVerifiedAt: new Date(),
      };
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockJwtService.sign.mockReturnValue('access-token');

      const result = await service.login(loginDto);

      // login()'s return is a union with the 2FA-pending branch; this
      // is the tokens branch, so narrow explicitly.
      if (!('accessToken' in result)) {
        throw new Error('expected tokens branch, got 2FA-pending branch');
      }
      expect(result.accessToken).toBe('access-token');
      expect(typeof result.refreshToken).toBe('string');
      expect(result.refreshToken.length).toBeGreaterThanOrEqual(60);
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

  describe('refreshToken (rotating, opaque tokens)', () => {
    // Helper: a "valid" opaque token is anything ≥32 chars. The service
    // hashes it and looks up the row by hash; the mock ignores the hash
    // and returns whatever we want for that call.
    const validRawToken = 'a'.repeat(64);
    const future = () => new Date(Date.now() + 60_000);

    beforeEach(() => {
      jest.clearAllMocks();
      mockPrisma.$transaction.mockImplementation((argsOrCb: unknown) => {
        if (typeof argsOrCb === 'function') {
          return (argsOrCb as (tx: typeof mockPrisma) => unknown)(mockPrisma);
        }
        return Promise.all(argsOrCb as unknown[]);
      });
    });

    it('rotates: marks the presented row used, issues a new pair, and links replacedById', async () => {
      mockPrisma.refreshToken.findUnique
        // 1. Initial lookup of the presented row.
        .mockResolvedValueOnce({
          id: 'row-old',
          userId: 'user-1',
          tokenHash: 'hash-old',
          expiresAt: future(),
          usedAt: null,
          revokedAt: null,
        })
        // 2. Lookup of the replacement row after generateTokens created it.
        .mockResolvedValueOnce({ id: 'row-new' });
      mockPrisma.refreshToken.updateMany.mockResolvedValueOnce({ count: 1 });
      mockPrisma.user.findUnique.mockResolvedValue({ tokenVersion: 5 });
      mockJwtService.sign.mockReturnValue('new-access');
      mockPrisma.refreshToken.create.mockResolvedValue({ id: 'row-new' });

      const result = await service.refreshToken(validRawToken);

      expect(result.accessToken).toBe('new-access');
      expect(typeof result.refreshToken).toBe('string');
      // New opaque token should be long (base64url of 48 bytes → 64 chars).
      expect(result.refreshToken.length).toBeGreaterThanOrEqual(60);

      // Old row marked used atomically.
      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 'row-old', usedAt: null, revokedAt: null }),
          data: expect.objectContaining({ usedAt: expect.any(Date) }),
        }),
      );
      // Chain link persisted.
      expect(mockPrisma.refreshToken.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'row-old' },
          data: { replacedById: 'row-new' },
        }),
      );
    });

    it('rejects an unknown token hash with a generic 401 (indistinguishable from garbage-collected)', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValue(null);
      await expect(service.refreshToken(validRawToken)).rejects.toThrow(
        UnauthorizedException,
      );
      // No reuse-detection triggered for unknown hashes.
      expect(mockPrisma.refreshToken.updateMany).not.toHaveBeenCalled();
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('reuse detection: a replayed used token revokes all outstanding tokens + bumps tokenVersion', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValueOnce({
        id: 'row-stolen',
        userId: 'user-1',
        tokenHash: 'hash-stolen',
        expiresAt: future(),
        usedAt: new Date(Date.now() - 1_000), // already rotated past
        revokedAt: null,
      });

      await expect(service.refreshToken(validRawToken)).rejects.toThrow(
        /reutilização/,
      );

      // Revocation sweep + tokenVersion bump run inside $transaction.
      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1', revokedAt: null },
          data: expect.objectContaining({ revokedAt: expect.any(Date) }),
        }),
      );
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: { tokenVersion: { increment: 1 } },
        }),
      );
    });

    it('reuse detection: presenting a revoked row also triggers the sweep', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValueOnce({
        id: 'row-revoked',
        userId: 'user-2',
        tokenHash: 'hash-revoked',
        expiresAt: future(),
        usedAt: null,
        revokedAt: new Date(Date.now() - 1_000),
      });

      await expect(service.refreshToken(validRawToken)).rejects.toThrow(
        /reutilização/,
      );
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { tokenVersion: { increment: 1 } },
        }),
      );
    });

    it('expired-but-never-used tokens return a plain 401 (NOT theft)', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValueOnce({
        id: 'row-old',
        userId: 'user-3',
        tokenHash: 'hash-old',
        expiresAt: new Date(Date.now() - 60_000),
        usedAt: null,
        revokedAt: null,
      });

      await expect(service.refreshToken(validRawToken)).rejects.toThrow(
        UnauthorizedException,
      );
      // NOT a reuse — must not revoke sibling tokens.
      expect(mockPrisma.refreshToken.updateMany).not.toHaveBeenCalled();
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('race-safe: loser of the updateMany CAS trips reuse detection', async () => {
      // Two concurrent /refresh with the same token. Both pass the
      // usedAt/revokedAt pre-check, both try to claim the row, only one
      // succeeds. The loser treats count=0 as theft.
      mockPrisma.refreshToken.findUnique.mockResolvedValueOnce({
        id: 'row-race',
        userId: 'user-4',
        tokenHash: 'hash-race',
        expiresAt: future(),
        usedAt: null,
        revokedAt: null,
      });
      mockPrisma.refreshToken.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(service.refreshToken(validRawToken)).rejects.toThrow(
        /reutilização/,
      );
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { tokenVersion: { increment: 1 } },
        }),
      );
    });

    it('rejects obviously malformed tokens before hitting the database', async () => {
      await expect(service.refreshToken('')).rejects.toThrow(UnauthorizedException);
      await expect(service.refreshToken('short')).rejects.toThrow(UnauthorizedException);
      expect(mockPrisma.refreshToken.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('revokeRefreshToken (logout)', () => {
    it('marks a live row revoked', async () => {
      mockPrisma.refreshToken.updateMany.mockResolvedValueOnce({ count: 1 });
      await service.revokeRefreshToken('a'.repeat(64));
      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ revokedAt: null }),
          data: expect.objectContaining({ revokedAt: expect.any(Date) }),
        }),
      );
    });

    it('is idempotent: unknown or already-revoked tokens return silently (no enumeration)', async () => {
      mockPrisma.refreshToken.updateMany.mockResolvedValueOnce({ count: 0 });
      await expect(
        service.revokeRefreshToken('b'.repeat(64)),
      ).resolves.toBeUndefined();
    });

    it('ignores non-string / empty inputs without hitting the DB', async () => {
      await service.revokeRefreshToken('');
      await service.revokeRefreshToken(undefined as unknown as string);
      expect(mockPrisma.refreshToken.updateMany).not.toHaveBeenCalled();
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
      mockJwtService.sign.mockReturnValue('access-token');

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

  // ── Session invalidation via tokenVersion (Wave 3B) ─────────────────
  // Every flow that must kick existing sessions MUST include
  // `tokenVersion: { increment: 1 }` in its User UPDATE. These assertions
  // pin that invariant directly so a future refactor can't silently drop
  // it — a bug the Wave 3B review agent flagged as the most likely
  // long-term regression vector.

  describe('tokenVersion invariants', () => {
    it('changePassword bumps tokenVersion in the same UPDATE as passwordHash', async () => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (bcrypt.hash as jest.Mock).mockResolvedValue('new-hash');
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        passwordHash: 'old-hash',
        deletedAt: null,
      });
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.passwordResetToken.updateMany.mockResolvedValue({ count: 0 });

      await service.changePassword('user-1', 'current', 'new-password');

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: expect.objectContaining({
            passwordHash: 'new-hash',
            tokenVersion: { increment: 1 },
          }),
        }),
      );
    });
  });

  describe('resetPassword (A-01: race-safe single-use claim)', () => {
    const rawToken = 'a'.repeat(64);
    const tokenHash = require('crypto')
      .createHash('sha256')
      .update(rawToken)
      .digest('hex');
    const future = () => new Date(Date.now() + 60_000);

    beforeEach(() => {
      jest.clearAllMocks();
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed_new_password');
    });

    it('happy path: claim wins, password + tokenVersion updated, sibling tokens invalidated', async () => {
      mockPrisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'prt-1',
        userId: 'user-1',
        tokenHash,
        usedAt: null,
        expiresAt: future(),
      });
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        deletedAt: null,
      });
      // Tx callback receives the same mockPrisma; the claim wins.
      mockPrisma.passwordResetToken.updateMany.mockResolvedValueOnce({ count: 1 });

      await service.resetPassword(rawToken, 'BrandNewPass123!');

      // Claim came first, INSIDE the tx, with the right where-clause.
      expect(mockPrisma.passwordResetToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'prt-1',
            usedAt: null,
            expiresAt: { gt: expect.any(Date) },
          }),
        }),
      );
      // Then user.update.
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            passwordHash: 'hashed_new_password',
            tokenVersion: { increment: 1 },
          }),
        }),
      );
    });

    it('A-01: race loser (updateMany count=0) throws and writes NO password / NO tokenVersion bump', async () => {
      mockPrisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'prt-1',
        userId: 'user-1',
        tokenHash,
        usedAt: null,
        expiresAt: future(),
      });
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        deletedAt: null,
      });
      // Concurrent winner already claimed.
      mockPrisma.passwordResetToken.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(
        service.resetPassword(rawToken, 'AttackerPass99!'),
      ).rejects.toThrow(/inválido|expirado/i);

      // Critical: no password write, no tokenVersion bump, no sibling
      // invalidation (all of which would let the race re-stack effects).
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('rejects when the token is not found', async () => {
      mockPrisma.passwordResetToken.findUnique.mockResolvedValue(null);
      await expect(
        service.resetPassword(rawToken, 'whatever'),
      ).rejects.toThrow(/inválido|expirado/i);
    });

    it('rejects when the token has already been used', async () => {
      mockPrisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'prt-1',
        userId: 'user-1',
        tokenHash,
        usedAt: new Date(),
        expiresAt: future(),
      });
      await expect(
        service.resetPassword(rawToken, 'whatever'),
      ).rejects.toThrow(/inválido|expirado/i);
    });
  });

  describe('forgotPassword (A-04: per-user throttle, neutral response)', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      mockRedisService.setNx.mockResolvedValue(true);
      mockRedisService.incrWithTtl.mockResolvedValue(1);
    });

    it('throttles per user across IP rotation: cooldown bucket short-circuits silently', async () => {
      // First call wins the cooldown — but for THIS test we simulate the
      // attacker's second call against the SAME victim email, where the
      // cooldown is still held.
      mockRedisService.setNx.mockResolvedValueOnce(false);
      // Critical: we still return the neutral response, never enumerate.
      const res = await service.forgotPassword('victim@example.com');
      expect(res.success).toBe(true);
      // No DB lookup, no token row written.
      expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
      expect(mockPrisma.passwordResetToken.create).not.toHaveBeenCalled();
      // Cooldown key is keyed on the lowercased+hashed email, NOT the IP.
      expect(mockRedisService.setNx).toHaveBeenCalledWith(
        expect.stringMatching(/^auth:pwreset:cooldown:[0-9a-f]{16}$/),
        '1',
        expect.any(Number),
      );
    });

    it('throttles per user when hourly cap is exceeded (still neutral)', async () => {
      mockRedisService.setNx.mockResolvedValue(true);
      mockRedisService.incrWithTtl.mockResolvedValue(99);
      const res = await service.forgotPassword('victim@example.com');
      expect(res.success).toBe(true);
      expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
      expect(mockPrisma.passwordResetToken.create).not.toHaveBeenCalled();
    });

    it('case-folds the email so attackers cannot rotate case to multiply the bucket', async () => {
      mockRedisService.setNx.mockResolvedValue(true);
      mockRedisService.incrWithTtl.mockResolvedValue(1);
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await service.forgotPassword('Victim@DAST.test');
      await service.forgotPassword('victim@dast.test');
      await service.forgotPassword('VICTIM@DAST.TEST');

      // All three should have hit the SAME cooldown key.
      const keys = mockRedisService.setNx.mock.calls.map((c) => c[0]);
      expect(new Set(keys).size).toBe(1);
    });

    it('returns the neutral response even when the user is unknown (no enumeration)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      const res = await service.forgotPassword('nobody@nowhere.test');
      expect(res.success).toBe(true);
      expect(mockPrisma.passwordResetToken.create).not.toHaveBeenCalled();
    });
  });

  describe('confirmLoginWithTwoFa (A-06: re-checks delete/ban on confirm)', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      mockJwtService.verify.mockReturnValue({ sub: 'user-1', type: 'twofa_pending' });
      mockRedisService.get.mockResolvedValue(null);
    });

    it('refuses to mint tokens when the user was soft-deleted between login and 2FA confirm', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        twoFaEnabled: true,
        twoFaMethod: 'TOTP',
        twoFaSecret: 'SECRET',
        deletedAt: new Date(),
        isBanned: false,
      });
      await expect(
        service.confirmLoginWithTwoFa('tmp', '123456'),
      ).rejects.toThrow(/inválido/i);
    });

    it('refuses to mint tokens when the user was banned between login and 2FA confirm', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        twoFaEnabled: true,
        twoFaMethod: 'TOTP',
        twoFaSecret: 'SECRET',
        deletedAt: null,
        isBanned: true,
      });
      await expect(
        service.confirmLoginWithTwoFa('tmp', '123456'),
      ).rejects.toThrow(/inválido/i);
    });
  });

  describe('adminSetup (A-10: timing-safe key compare)', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'ADMIN_SETUP_KEY') return 'super-secret-admin-key-zxcvbnm';
        if (key === 'TOS_VERSION') return '1.0.0';
        return undefined;
      });
    });

    it('rejects a wrong key without throwing on length mismatch (timingSafeEqual would, we collapse)', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      await expect(service.adminSetup('user-1', 'short')).rejects.toThrow(
        /inválida/,
      );
    });

    it('rejects a same-length but wrong key (constant-time path)', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      await expect(
        service.adminSetup('user-1', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
      ).rejects.toThrow(/inválida/);
    });

    it('accepts the correct key (sanity)', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        deletedAt: null,
      });
      mockPrisma.user.update.mockResolvedValue({});
      await expect(
        service.adminSetup('user-1', 'super-secret-admin-key-zxcvbnm'),
      ).resolves.toBeDefined();
    });
  });
});
