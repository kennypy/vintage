import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { PrismaService } from '../prisma/prisma.service';
import { PayoutsService } from './payouts.service';

const mockPrisma = {
  wallet: {
    findUnique: jest.fn(),
  },
  walletTransaction: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
};

const mockPayouts = {
  requestPayout: jest.fn(),
};

describe('WalletService', () => {
  let service: WalletService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PayoutsService, useValue: mockPayouts },
      ],
    }).compile();

    service = module.get<WalletService>(WalletService);
  });

  describe('getWallet', () => {
    it('should return wallet balance', async () => {
      const wallet = { id: 'wallet-1', userId: 'user-1', balanceBrl: 250.0, pendingBrl: 0 };
      mockPrisma.wallet.findUnique.mockResolvedValue(wallet);

      const result = await service.getWallet('user-1');

      expect(result).toEqual(wallet);
      expect(mockPrisma.wallet.findUnique).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
      });
    });

    it('throws NotFound if wallet missing', async () => {
      mockPrisma.wallet.findUnique.mockResolvedValue(null);
      await expect(service.getWallet('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getTransactions', () => {
    it('paginates', async () => {
      mockPrisma.wallet.findUnique.mockResolvedValue({ id: 'w1' });
      mockPrisma.walletTransaction.findMany.mockResolvedValue([{ id: 'tx1' }]);
      mockPrisma.walletTransaction.count.mockResolvedValue(1);

      const result = await service.getTransactions('user-1', 1, 20);
      expect(result.total).toBe(1);
      expect(result.hasMore).toBe(false);
    });
  });

  // Wave 3C moved the payout pipeline out to PayoutsService. WalletService
  // keeps a thin wrapper for backwards compatibility — verify it delegates
  // without adding any behavior of its own.
  describe('requestPayout (delegation only)', () => {
    it('forwards args to PayoutsService.requestPayout verbatim', async () => {
      mockPayouts.requestPayout.mockResolvedValue({ success: true, newBalance: 0, payoutRequestId: 'pr-1', status: 'PROCESSING' });

      const result = await service.requestPayout('user-1', 50, 'method-1');

      expect(mockPayouts.requestPayout).toHaveBeenCalledWith('user-1', 50, 'method-1');
      expect(result).toMatchObject({ payoutRequestId: 'pr-1' });
    });
  });
});
