import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
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
};

const mockNotificationsService = {
  createNotification: jest.fn(),
};

const mockRedisService = {
  get: jest.fn(),
  set: jest.fn(),
  incr: jest.fn(),
  expire: jest.fn(),
  del: jest.fn(),
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
});
