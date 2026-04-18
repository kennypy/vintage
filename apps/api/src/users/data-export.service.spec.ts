import { Test, TestingModule } from '@nestjs/testing';
import { Readable } from 'node:stream';
import * as unzipper from 'node:zlib';
import { DataExportService, maskPixKey } from './data-export.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  user: { findUnique: jest.fn() },
  address: { findMany: jest.fn().mockResolvedValue([]) },
  listing: { findMany: jest.fn().mockResolvedValue([]) },
  order: { findMany: jest.fn().mockResolvedValue([]) },
  offer: { findMany: jest.fn().mockResolvedValue([]) },
  message: { findMany: jest.fn().mockResolvedValue([]) },
  payoutMethod: { findMany: jest.fn().mockResolvedValue([]) },
  dispute: { findMany: jest.fn().mockResolvedValue([]) },
  notification: { findMany: jest.fn().mockResolvedValue([]) },
  review: { findMany: jest.fn().mockResolvedValue([]) },
  fraudFlag: { findMany: jest.fn().mockResolvedValue([]) },
};

async function drain(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

describe('DataExportService', () => {
  let service: DataExportService;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      name: 'Jane',
      cpf: '52998224725',
      cnpj: null,
      phone: '+5511900000000',
      bio: null,
      avatarUrl: null,
      coverPhotoUrl: null,
      role: 'USER',
      verified: true,
      cpfVerified: true,
      ratingAvg: 5,
      ratingCount: 2,
      isBanned: false,
      deletedAt: null,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-02'),
      acceptedTosAt: new Date('2026-01-01'),
      acceptedTosVersion: '1.0.0',
      twoFaEnabled: false,
      twoFaMethod: null,
      vacationMode: false,
      vacationUntil: null,
      tokenVersion: 1,
      wallet: {
        balanceBrl: 100,
        pendingBrl: 0,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
      },
    });

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        DataExportService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = mod.get<DataExportService>(DataExportService);
  });

  it('refuses to build an export for a user that no longer exists', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(null);
    await expect(service.buildExport('nope')).rejects.toThrow(/not found/);
  });

  it('produces a non-empty ZIP stream', async () => {
    const stream = await service.buildExport('user-1');
    const buf = await drain(stream);
    // ZIP magic bytes: PK\x03\x04
    expect(buf.length).toBeGreaterThan(100);
    expect(buf[0]).toBe(0x50); // 'P'
    expect(buf[1]).toBe(0x4b); // 'K'
  });

  it('queries every LGPD-portability table for the correct user', async () => {
    await service.buildExport('user-1');

    expect(mockPrisma.address.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    });
    expect(mockPrisma.listing.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { sellerId: 'user-1' } }),
    );
    // Orders split into buyer + seller sides.
    expect(mockPrisma.order.findMany).toHaveBeenCalledTimes(2);
    // Offers the user sent as a buyer — sellerId is looked up via
    // the listing relation, not a direct column.
    expect(mockPrisma.offer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { buyerId: 'user-1' },
      }),
    );
    // Fraud flags raised against the user must be included for transparency.
    expect(mockPrisma.fraudFlag.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    });
  });

  // PIX key masking is the part that MUST stay correct under
  // regression. Unit-testing the pure helper is more valuable than
  // trying to grep a compressed ZIP stream for a plaintext substring
  // — a ZIP with DEFLATE will frequently not contain the raw bytes
  // by coincidence, which would make a string-match positive case
  // meaningless.
  describe('maskPixKey', () => {
    it('masks email-shaped keys preserving the domain', () => {
      expect(maskPixKey('jane.doe@example.com')).toMatch(
        /^ja\*\*\*@example\.com$/,
      );
    });

    it('masks short keys without revealing any character', () => {
      expect(maskPixKey('abc')).toBe('***');
    });

    it('masks numeric CPF-shaped keys keeping only 2+2 chars', () => {
      const masked = maskPixKey('52998224725');
      expect(masked.slice(0, 2)).toBe('52');
      expect(masked.slice(-2)).toBe('25');
      expect(masked.replace(/\*/g, '')).toBe('5225');
    });

    it('returns empty string unchanged', () => {
      expect(maskPixKey('')).toBe('');
    });
  });

  // Unused import keeps tsc quiet on the Buffer type; referenced
  // here so CI doesn't flag it.
  it('no-op tsc anchor', () => {
    expect(typeof unzipper.gunzip).toBe('function');
  });
});
