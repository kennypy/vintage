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
import { AuditLogService } from '../audit-log/audit-log.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CpfVaultService } from '../common/services/cpf-vault.service';
import { CronLockService } from '../common/services/cron-lock.service';

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
  consentRecord: {
    deleteMany: jest.fn(),
  },
  $transaction: jest.fn(),
  address: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUniqueOrThrow: jest.fn(),
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
        { provide: CpfVaultService, useValue: { encrypt: jest.fn((v) => 'ENC(' + v + ')'), decrypt: jest.fn((v) => typeof v === 'string' ? v.replace(/^ENC\(|\)$/g, '') : v), lookupHash: jest.fn((v) => 'HASH(' + v + ')') } },
        { provide: AuditLogService, useValue: { record: jest.fn().mockResolvedValue(undefined) } },
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
        {
          provide: NotificationsService,
          useValue: { createNotification: jest.fn().mockResolvedValue(null) },
        },
        {
          // UsersService now guards hardDeleteExpiredAccounts with a
          // distributed lock (prevents multi-instance 03:00-UTC races).
          // The test bootstrap never runs the cron, but DI still needs
          // the provider to instantiate UsersService.
          provide: CronLockService,
          useValue: {
            acquire: jest.fn().mockResolvedValue(true),
            release: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  describe('getProfile', () => {
    it('should return public profile data', async () => {
      const userData = {
        id: 'user-1',
        name: 'Maria Silva',
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
    });

    it('NEVER selects email or phone on the public profile (DAST D-04)', async () => {
      // /users/:id has no auth guard — anyone on the internet can
      // hit it with a user id (trivially harvested from listings /
      // reviews / follower lists). Pre-fix, the projection included
      // email and phone; the test locks them out of the select so
      // a future well-meaning refactor can't re-expose them.
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        name: 'Maria Silva',
        avatarUrl: null,
        bio: null,
        verified: false,
        vacationMode: false,
        ratingAvg: 0,
        ratingCount: 0,
        followerCount: 0,
        followingCount: 0,
        createdAt: new Date(),
      });

      await service.getProfile('user-1');

      const selectArg =
        mockPrisma.user.findUnique.mock.calls[0][0].select;
      expect(selectArg).not.toHaveProperty('email');
      expect(selectArg).not.toHaveProperty('phone');
      expect(selectArg).not.toHaveProperty('cpf');
      expect(selectArg).not.toHaveProperty('passwordHash');
      // Sanity: we DO still return the storefront fields.
      expect(selectArg).toMatchObject({
        id: true,
        name: true,
        avatarUrl: true,
        bio: true,
        ratingAvg: true,
        ratingCount: true,
      });
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
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-2', name: 'Maria' });
      // createdAt set to "just now" so the service's new-edge
      // detection (Date.now() - createdAt < 1s) fires the notification.
      mockPrisma.follow.upsert.mockResolvedValue({ createdAt: new Date() });
      mockPrisma.user.update.mockResolvedValue({});

      const result = await service.followUser('user-1', 'user-2');

      expect(result).toEqual({ following: true });
      expect(mockPrisma.follow.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            followerId_followingId: {
              followerId: 'user-1',
              followingId: 'user-2',
            },
          },
          create: { followerId: 'user-1', followingId: 'user-2' },
          update: {},
        }),
      );
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

  describe('notification preferences', () => {
    // DB columns use notif-prefix to keep them grouped on the User row;
    // the API response flattens them to match the web's NotificationPreferences
    // shape. Both halves of the mapping exercised below.
    const DB_ROW = {
      pushEnabled: true,
      emailEnabled: true,
      notifOrders: true,
      notifMessages: false,
      notifOffers: true,
      notifFollowers: true,
      notifPriceDrops: false,
      notifPromotions: true,
      notifNews: true,
      notifReviews: true,
      notifFavorites: true,
      notifDailyCap: 0,
    };

    describe('getNotificationPreferences', () => {
      it('flattens notif-prefixed DB columns to the web-facing shape', async () => {
        mockPrisma.user.findUnique.mockResolvedValue(DB_ROW);

        const result = await service.getNotificationPreferences('user-1');

        expect(result).toEqual({
          pushEnabled: true,
          emailEnabled: true,
          orders: true,
          messages: false,
          offers: true,
          followers: true,
          priceDrops: false,
          promotions: true,
          news: true,
          reviews: true,
          favorites: true,
          dailyCap: 0,
        });
      });

      it('throws NotFoundException when the user does not exist', async () => {
        mockPrisma.user.findUnique.mockResolvedValue(null);

        await expect(
          service.getNotificationPreferences('ghost'),
        ).rejects.toThrow(NotFoundException);
      });
    });

    describe('updateNotificationPreferences', () => {
      it('applies only the fields present in the patch (flat → notif-prefix)', async () => {
        mockPrisma.user.update.mockResolvedValue({});
        mockPrisma.user.findUnique.mockResolvedValue({
          ...DB_ROW,
          notifOrders: false,
          notifMessages: true,
        });

        await service.updateNotificationPreferences('user-1', {
          orders: false,
          messages: true,
        });

        expect(mockPrisma.user.update).toHaveBeenCalledWith({
          where: { id: 'user-1' },
          data: { notifOrders: false, notifMessages: true },
        });
      });

      it('passes channel toggles through unmapped', async () => {
        mockPrisma.user.update.mockResolvedValue({});
        mockPrisma.user.findUnique.mockResolvedValue({
          ...DB_ROW,
          pushEnabled: false,
          emailEnabled: false,
        });

        await service.updateNotificationPreferences('user-1', {
          pushEnabled: false,
          emailEnabled: false,
        });

        expect(mockPrisma.user.update).toHaveBeenCalledWith({
          where: { id: 'user-1' },
          data: { pushEnabled: false, emailEnabled: false },
        });
      });

      it('returns the updated preferences in web-facing shape', async () => {
        mockPrisma.user.update.mockResolvedValue({});
        mockPrisma.user.findUnique.mockResolvedValue({
          ...DB_ROW,
          notifPromotions: false,
        });

        const result = await service.updateNotificationPreferences('user-1', {
          promotions: false,
        });

        expect(result.promotions).toBe(false);
        expect(result).toHaveProperty('orders');
      });

      it('ignores fields not in the patch (Prisma noop)', async () => {
        mockPrisma.user.update.mockResolvedValue({});
        mockPrisma.user.findUnique.mockResolvedValue(DB_ROW);

        await service.updateNotificationPreferences('user-1', {});

        expect(mockPrisma.user.update).toHaveBeenCalledWith({
          where: { id: 'user-1' },
          data: {},
        });
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

    it('persists the CPF as AES-encrypted ciphertext + lookup hash — identity still unverified', async () => {
      mockPrisma.user.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.setCpf('user-1', VALID_CPF_FORMATTED);

      expect(result).toEqual({ success: true });
      // Modulo-11 passed; the row gets cpfChecksumValid=true. CPF
      // itself is stored as CpfVaultService ciphertext + HMAC lookup
      // hash; the plaintext never touches the DB. The separate
      // cpfIdentityVerified column stays at its default (false) —
      // only a Track-B KYC provider can flip that.
      expect(mockPrisma.user.updateMany).toHaveBeenCalledWith({
        where: { id: 'user-1', cpfEncrypted: null, cpfLookupHash: null },
        data: {
          cpfEncrypted: `ENC(${VALID_CPF_PLAIN})`,
          cpfLookupHash: `HASH(${VALID_CPF_PLAIN})`,
          cpfChecksumValid: true,
        },
      });
    });
  });

  describe('updateAddress', () => {
    // PATCH /users/me/addresses/:id was added after the web addresses
    // page was silently 405'ing. Pin the default-flip semantics (only
    // clear OTHER defaults when switching TO default), the ownership
    // check, and the CEP normalization so this doesn't regress.
    beforeEach(() => {
      mockPrisma.$transaction.mockImplementation(
        async (fn: any) => fn(mockPrisma),
      );
    });

    it('404s when the address belongs to another user', async () => {
      mockPrisma.address.findFirst.mockResolvedValue(null);
      await expect(
        service.updateAddress('user-1', 'addr-x', { label: 'new' } as any),
      ).rejects.toThrow('Endereço não encontrado');
    });

    it('flipping isDefault true clears other defaults exactly once', async () => {
      mockPrisma.address.findFirst.mockResolvedValue({
        id: 'addr-1',
        userId: 'user-1',
        isDefault: false,
      });
      mockPrisma.address.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.address.update.mockResolvedValue({});
      mockPrisma.address.findUniqueOrThrow.mockResolvedValue({
        id: 'addr-1',
        isDefault: true,
      });

      await service.updateAddress('user-1', 'addr-1', { isDefault: true } as any);

      expect(mockPrisma.address.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', isDefault: true },
        data: { isDefault: false },
      });
      expect(mockPrisma.address.update).toHaveBeenCalledWith({
        where: { id: 'addr-1' },
        data: { isDefault: true },
      });
    });

    it('normalizes CEP to NNNNN-NNN', async () => {
      mockPrisma.address.findFirst.mockResolvedValue({
        id: 'addr-1',
        userId: 'user-1',
        isDefault: true,
      });
      mockPrisma.address.update.mockResolvedValue({});
      mockPrisma.address.findUniqueOrThrow.mockResolvedValue({ id: 'addr-1' });

      await service.updateAddress('user-1', 'addr-1', { cep: '01234567' } as any);

      expect(mockPrisma.address.update).toHaveBeenCalledWith({
        where: { id: 'addr-1' },
        data: { cep: '01234-567' },
      });
      // Already the default → must NOT wipe other defaults.
      expect(mockPrisma.address.updateMany).not.toHaveBeenCalled();
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
