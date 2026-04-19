import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PayoutMethodsService } from './payout-methods.service';
import { PrismaService } from '../prisma/prisma.service';

// Use the real validation/mask helpers — no mock. The point of these tests
// is to verify that canonicalisation + masking + dedupe all line up.

const mockPrisma = {
  payoutMethod: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
  },
  $transaction: jest.fn(),
};

describe('PayoutMethodsService', () => {
  let service: PayoutMethodsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    // Default: interactive $transaction runs the callback with the tx client
    mockPrisma.$transaction.mockImplementation(async (cb: unknown) =>
      typeof cb === 'function' ? cb(mockPrisma) : undefined,
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayoutMethodsService,
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: (await import('../audit-log/audit-log.service')).AuditLogService,
          useValue: { record: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    service = module.get<PayoutMethodsService>(PayoutMethodsService);
  });

  describe('list', () => {
    it('returns masked pixKey with hidden domain provider', async () => {
      mockPrisma.payoutMethod.findMany.mockResolvedValue([
        {
          id: 'm1',
          userId: 'u1',
          type: 'PIX_EMAIL',
          pixKey: 'jane@gmail.com',
          label: null,
          isDefault: true,
          createdAt: new Date('2024-01-01'),
        },
      ]);

      const out = await service.list('u1');

      expect(out[0]).not.toHaveProperty('pixKey');
      // Domain provider (gmail) must NOT appear — we only keep the TLD.
      expect(out[0].pixKeyMasked).not.toMatch(/gmail/);
      expect(out[0].pixKeyMasked).toBe('j•••@g•••.com');
    });

    it('returns masked phone with hidden area code', async () => {
      mockPrisma.payoutMethod.findMany.mockResolvedValue([
        {
          id: 'm2',
          userId: 'u1',
          type: 'PIX_PHONE',
          pixKey: '+5511999998888',
          label: null,
          isDefault: false,
          createdAt: new Date('2024-01-02'),
        },
      ]);

      const out = await service.list('u1');

      // DDD (11) must NOT be visible — only last 4 digits of the line.
      expect(out[0].pixKeyMasked).toBe('+55 •• ••••-8888');
      expect(out[0].pixKeyMasked).not.toContain('11');
    });
  });

  describe('create', () => {
    it('rejects an invalid PIX key for the declared type', async () => {
      mockPrisma.payoutMethod.count.mockResolvedValue(0);

      await expect(
        service.create('u1', { type: 'PIX_CPF', pixKey: '000.000.000-00' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a non-Brazilian phone number (silent coercion would fail at payout)', async () => {
      mockPrisma.payoutMethod.count.mockResolvedValue(0);
      mockPrisma.payoutMethod.findUnique.mockResolvedValue(null);

      // US number: 11 national digits (area + subscriber) but country code 1.
      await expect(
        service.create('u1', { type: 'PIX_PHONE', pixKey: '+14155552671' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('normalises CPF input (digits only) and stores canonical form', async () => {
      mockPrisma.payoutMethod.count.mockResolvedValue(0);
      mockPrisma.payoutMethod.findUnique.mockResolvedValue(null);
      mockPrisma.payoutMethod.create.mockImplementation(async ({ data }) => ({
        id: 'm1',
        createdAt: new Date(),
        ...data,
      }));

      // Real valid CPF: 529.982.247-25
      const out = await service.create('u1', {
        type: 'PIX_CPF',
        pixKey: '529.982.247-25',
      });

      expect(mockPrisma.payoutMethod.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ pixKey: '52998224725' }),
        }),
      );
      // Only the last two digits should leak into the mask.
      expect(out.pixKeyMasked).toBe('•••.•••.•••-25');
    });

    it('rejects a duplicate key for the same user + type combination', async () => {
      mockPrisma.payoutMethod.count.mockResolvedValue(1);
      mockPrisma.payoutMethod.findUnique.mockResolvedValue({ id: 'm1', userId: 'u1' });

      await expect(
        service.create('u1', { type: 'PIX_EMAIL', pixKey: 'jane@example.com' }),
      ).rejects.toThrow(ConflictException);
      // Must be queried by the compound key, not plain (userId, pixKey) —
      // otherwise the same PIX value can't be added under two types.
      expect(mockPrisma.payoutMethod.findUnique).toHaveBeenCalledWith({
        where: {
          userId_type_pixKey: {
            userId: 'u1',
            type: 'PIX_EMAIL',
            pixKey: 'jane@example.com',
          },
        },
      });
    });

    it('enforces MAX_METHODS_PER_USER', async () => {
      mockPrisma.payoutMethod.count.mockResolvedValue(5);

      await expect(
        service.create('u1', { type: 'PIX_EMAIL', pixKey: 'jane@example.com' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('first method created is always default even without isDefault=true', async () => {
      mockPrisma.payoutMethod.count.mockResolvedValue(0);
      mockPrisma.payoutMethod.findUnique.mockResolvedValue(null);
      mockPrisma.payoutMethod.create.mockImplementation(async ({ data }) => ({
        id: 'm1',
        createdAt: new Date(),
        ...data,
      }));

      const out = await service.create('u1', {
        type: 'PIX_EMAIL',
        pixKey: 'jane@example.com',
      });

      expect(out.isDefault).toBe(true);
    });

    it('demotes the previous default when isDefault=true is requested', async () => {
      mockPrisma.payoutMethod.count.mockResolvedValue(1);
      mockPrisma.payoutMethod.findUnique.mockResolvedValue(null);
      mockPrisma.payoutMethod.create.mockImplementation(async ({ data }) => ({
        id: 'm2',
        createdAt: new Date(),
        ...data,
      }));

      await service.create('u1', {
        type: 'PIX_EMAIL',
        pixKey: 'two@example.com',
        isDefault: true,
      });

      expect(mockPrisma.payoutMethod.updateMany).toHaveBeenCalledWith({
        where: { userId: 'u1', isDefault: true },
        data: { isDefault: false },
      });
    });
  });

  describe('delete', () => {
    it('rejects another user owning the method (no data leak between users)', async () => {
      mockPrisma.payoutMethod.findUnique.mockResolvedValue({
        id: 'm1',
        userId: 'other-user',
        isDefault: false,
      });

      await expect(service.delete('u1', 'm1')).rejects.toThrow(NotFoundException);
      expect(mockPrisma.payoutMethod.delete).not.toHaveBeenCalled();
    });

    it('promotes the next newest method to default when deleting the default', async () => {
      mockPrisma.payoutMethod.findUnique.mockResolvedValue({
        id: 'm1',
        userId: 'u1',
        isDefault: true,
      });
      mockPrisma.payoutMethod.findFirst.mockResolvedValue({ id: 'm2', userId: 'u1' });

      await service.delete('u1', 'm1');

      expect(mockPrisma.payoutMethod.delete).toHaveBeenCalledWith({ where: { id: 'm1' } });
      expect(mockPrisma.payoutMethod.update).toHaveBeenCalledWith({
        where: { id: 'm2' },
        data: { isDefault: true },
      });
    });
  });

  describe('getOwnedOrThrow', () => {
    it('throws Forbidden when the method belongs to another user', async () => {
      mockPrisma.payoutMethod.findUnique.mockResolvedValue({ id: 'm1', userId: 'other' });

      await expect(service.getOwnedOrThrow('u1', 'm1')).rejects.toThrow(ForbiddenException);
    });

    it('returns the row when the method belongs to the caller', async () => {
      mockPrisma.payoutMethod.findUnique.mockResolvedValue({
        id: 'm1',
        userId: 'u1',
        type: 'PIX_EMAIL',
        pixKey: 'jane@example.com',
      });

      const row = await service.getOwnedOrThrow('u1', 'm1');
      expect(row.id).toBe('m1');
    });
  });
});
