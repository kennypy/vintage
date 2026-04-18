import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { ListingsService } from '../listings/listings.service';
import * as bcrypt from 'bcrypt';

jest.mock('bcrypt');

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  listing: {
    findMany: jest.fn(),
    count: jest.fn(),
    updateMany: jest.fn(),
  },
  order: {
    updateMany: jest.fn(),
  },
  offer: {
    updateMany: jest.fn(),
  },
  deletionAuditLog: {
    create: jest.fn(),
  },
  payoutMethod: {
    deleteMany: jest.fn(),
  },
  $transaction: jest.fn(),
  address: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    count: jest.fn(),
  },
  follow: {
    upsert: jest.fn(),
    findUnique: jest.fn(),
    delete: jest.fn(),
  },
};

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: EmailService,
          useValue: {
            sendEmail: jest.fn(),
            sendWelcomeEmail: jest.fn(),
            sendDeletionConfirmation: jest.fn(),
          },
        },
        {
          provide: ListingsService,
          useValue: { syncSearchIndex: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  describe('getProfile', () => {
    it('should return user data', async () => {
      const userData = {
        id: 'user-1',
        email: 'maria@example.com',
        name: 'Maria Silva',
        phone: null,
        avatarUrl: null,
        bio: null,
        verified: false,
        vacationMode: false,
        ratingAvg: 0,
        ratingCount: 0,
        followerCount: 0,
        followingCount: 0,
        createdAt: new Date(),
      };
      mockPrisma.user.findUnique.mockResolvedValue(userData);

      const result = await service.getProfile('user-1');

      expect(result).toEqual(userData);
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
        }),
      );
    });

    it('should throw NotFoundException if user does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getProfile('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.getProfile('nonexistent')).rejects.toThrow(
        'Usuário não encontrado',
      );
    });
  });

  describe('updateProfile', () => {
    it('should update allowed fields', async () => {
      const updated = {
        id: 'user-1',
        name: 'Maria Atualizada',
        bio: 'Nova bio',
        phone: '+5511888888888',
        avatarUrl: null,
      };
      mockPrisma.user.update.mockResolvedValue(updated);

      const result = await service.updateProfile('user-1', 'user-1', {
        name: 'Maria Atualizada',
        bio: 'Nova bio',
        phone: '+5511888888888',
      });

      expect(result).toEqual(updated);
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: expect.objectContaining({
            name: 'Maria Atualizada',
            bio: 'Nova bio',
            phone: '+5511888888888',
          }),
        }),
      );
    });

    it('should reject if user tries to edit another profile', async () => {
      await expect(
        service.updateProfile('user-1', 'user-2', { name: 'Hacked' }),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.updateProfile('user-1', 'user-2', { name: 'Hacked' }),
      ).rejects.toThrow('Você só pode editar seu próprio perfil');
    });
  });

  describe('followUser', () => {
    it('should create follow relationship', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-2' });
      mockPrisma.follow.upsert.mockResolvedValue({});
      mockPrisma.user.update.mockResolvedValue({});

      const result = await service.followUser('user-1', 'user-2');

      expect(result).toEqual({ following: true });
      expect(mockPrisma.follow.upsert).toHaveBeenCalledWith({
        where: {
          followerId_followingId: {
            followerId: 'user-1',
            followingId: 'user-2',
          },
        },
        create: { followerId: 'user-1', followingId: 'user-2' },
        update: {},
      });
    });

    it('should reject following yourself', async () => {
      await expect(
        service.followUser('user-1', 'user-1'),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.followUser('user-1', 'user-1'),
      ).rejects.toThrow('Você não pode seguir a si mesmo');
    });

    it('should reject if target user does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.followUser('user-1', 'nonexistent'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('unfollowUser', () => {
    it('should remove follow relationship', async () => {
      mockPrisma.follow.findUnique.mockResolvedValue({
        followerId: 'user-1',
        followingId: 'user-2',
      });
      mockPrisma.follow.delete.mockResolvedValue({});
      mockPrisma.user.update.mockResolvedValue({});

      const result = await service.unfollowUser('user-1', 'user-2');

      expect(result).toEqual({ following: false });
      expect(mockPrisma.follow.delete).toHaveBeenCalled();
    });

    it('should return false if not following', async () => {
      mockPrisma.follow.findUnique.mockResolvedValue(null);

      const result = await service.unfollowUser('user-1', 'user-2');

      expect(result).toEqual({ following: false });
      expect(mockPrisma.follow.delete).not.toHaveBeenCalled();
    });
  });

  describe('toggleVacationMode', () => {
    it('should enable vacation mode and pause listings', async () => {
      mockPrisma.user.update.mockResolvedValue({
        vacationMode: true,
        vacationUntil: null,
      });
      mockPrisma.listing.findMany.mockResolvedValue([{ id: 'l-1' }, { id: 'l-2' }]);
      mockPrisma.listing.updateMany.mockResolvedValue({ count: 2 });

      const result = await service.toggleVacationMode('user-1', true);

      expect(result).toEqual({ vacationMode: true, vacationUntil: null });
      expect(mockPrisma.listing.updateMany).toHaveBeenCalledWith({
        where: { sellerId: 'user-1', status: 'ACTIVE' },
        data: { status: 'PAUSED' },
      });
    });

    it('should disable vacation mode and reactivate listings', async () => {
      mockPrisma.user.update.mockResolvedValue({
        vacationMode: false,
        vacationUntil: null,
      });
      mockPrisma.listing.findMany.mockResolvedValue([{ id: 'l-1' }]);
      mockPrisma.listing.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.toggleVacationMode('user-1', false);

      expect(result).toEqual({ vacationMode: false, vacationUntil: null });
      expect(mockPrisma.listing.updateMany).toHaveBeenCalledWith({
        where: { sellerId: 'user-1', status: 'PAUSED' },
        data: { status: 'ACTIVE' },
      });
    });
  });

  describe('setCpf', () => {
    // Real CPF with a valid check-digit (Modulo 11). Never use the 11-same-
    // digit masks (111…) — the validator correctly rejects those.
    const VALID_CPF_PLAIN = '52998224725';
    const VALID_CPF_FORMATTED = '529.982.247-25';

    it('rejects an invalid CPF (fails Modulo 11) before touching the DB', async () => {
      await expect(service.setCpf('user-1', '111.111.111-11')).rejects.toThrow(
        'CPF inválido',
      );
      // No DB calls AT ALL: validation happens before updateMany.
      expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
      expect(mockPrisma.user.updateMany).not.toHaveBeenCalled();
    });

    it('does NOT pre-fetch the user (defeats the timing side channel)', async () => {
      mockPrisma.user.updateMany.mockResolvedValue({ count: 1 });

      await service.setCpf('user-1', VALID_CPF_FORMATTED);

      // The earlier implementation did a findUnique first, which made
      // "user already has CPF" return ~3x faster than "CPF taken
      // elsewhere". A session-cookie attacker could measure the
      // difference to probe whether a target had linked a CPF.
      expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('returns the UNIFORM error when count=0 (covers not-found, already-set, and race)', async () => {
      mockPrisma.user.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.setCpf('user-1', VALID_CPF_FORMATTED)).rejects.toThrow(
        'Não foi possível cadastrar',
      );
      // Critical: we must NOT throw NotFoundException even if the user
      // doesn't exist, because that would enumerate valid user IDs.
      await expect(service.setCpf('user-1', VALID_CPF_FORMATTED)).rejects.not.toThrow(
        NotFoundException,
      );
    });

    it('returns the UNIFORM error on Prisma P2002 (CPF belongs to another account)', async () => {
      const p2002 = Object.assign(new Error('Unique constraint'), { code: 'P2002' });
      mockPrisma.user.updateMany.mockRejectedValue(p2002);

      await expect(service.setCpf('user-1', VALID_CPF_FORMATTED)).rejects.toThrow(
        'Não foi possível cadastrar',
      );
    });

    it('re-throws unexpected DB errors (not swallowed as BadRequest)', async () => {
      const unknown = new Error('connection timeout');
      mockPrisma.user.updateMany.mockRejectedValue(unknown);

      await expect(service.setCpf('user-1', VALID_CPF_FORMATTED)).rejects.toThrow(
        'connection timeout',
      );
    });

    it('persists the CPF as digits-only and leaves cpfVerified=false', async () => {
      mockPrisma.user.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.setCpf('user-1', VALID_CPF_FORMATTED);

      expect(result).toEqual({ success: true });
      expect(mockPrisma.user.updateMany).toHaveBeenCalledWith({
        where: { id: 'user-1', cpf: null },
        data: { cpf: VALID_CPF_PLAIN, cpfVerified: false },
      });
    });
  });

  describe('deleteAccount — PII cleanup', () => {
    // The soft-delete path must wipe PayoutMethod rows: the pixKey column
    // stores the raw CPF / email / phone the user linked for withdrawals,
    // which would otherwise outlive the anonymized User row and re-bind
    // PII to the deleted account. This test pins the cleanup against
    // regression (there was zero coverage before the final review caught it).
    it('deletes PayoutMethod rows inside the soft-delete transaction', async () => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'jane@example.com',
        passwordHash: 'hashed',
        deletedAt: null,
        socialProvider: null,
      });
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.listing.findMany.mockResolvedValue([]);
      mockPrisma.listing.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.order.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.offer.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.deletionAuditLog.create.mockResolvedValue({});
      mockPrisma.payoutMethod.deleteMany.mockResolvedValue({ count: 2 });
      mockPrisma.$transaction.mockImplementation(async (cb: unknown) =>
        typeof cb === 'function' ? (cb as (t: typeof mockPrisma) => unknown)(mockPrisma) : undefined,
      );

      await service.deleteAccount('user-1', { password: 'pw123' });

      expect(mockPrisma.payoutMethod.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
      });
    });
  });
});
