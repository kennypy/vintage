import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { PrismaService } from '../prisma/prisma.service';
import { PayoutMethodsService } from './payout-methods.service';

jest.mock('@vintage/shared', () => ({
  MIN_PAYOUT_BRL: 10.0,
}));

const mockPrisma = {
  wallet: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  walletTransaction: {
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockPayoutMethods = {
  getOwnedOrThrow: jest.fn(),
};

describe('WalletService', () => {
  let service: WalletService;

  beforeEach(async () => {
    jest.clearAllMocks();
    // Default: caller owns the method. Individual tests override.
    mockPayoutMethods.getOwnedOrThrow.mockResolvedValue({
      id: 'method-1',
      userId: 'user-1',
      type: 'PIX_EMAIL',
      pixKey: 'jane@example.com',
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PayoutMethodsService, useValue: mockPayoutMethods },
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

    it('should throw NotFoundException if wallet not found', async () => {
      mockPrisma.wallet.findUnique.mockResolvedValue(null);

      await expect(service.getWallet('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.getWallet('nonexistent')).rejects.toThrow(
        'Carteira não encontrada',
      );
    });
  });

  describe('getTransactions', () => {
    it('should return paginated transactions', async () => {
      const wallet = { id: 'wallet-1', userId: 'user-1' };
      mockPrisma.wallet.findUnique.mockResolvedValue(wallet);

      const transactions = [
        { id: 'tx-1', type: 'CREDIT', amountBrl: 100 },
        { id: 'tx-2', type: 'PAYOUT', amountBrl: -50 },
      ];
      mockPrisma.walletTransaction.findMany.mockResolvedValue(transactions);
      mockPrisma.walletTransaction.count.mockResolvedValue(2);

      const result = await service.getTransactions('user-1', 1, 20);

      expect(result).toEqual({
        items: transactions,
        total: 2,
        page: 1,
        pageSize: 20,
        hasMore: false,
      });
    });

    it('should throw NotFoundException if wallet not found', async () => {
      mockPrisma.wallet.findUnique.mockResolvedValue(null);

      await expect(service.getTransactions('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should calculate hasMore correctly', async () => {
      mockPrisma.wallet.findUnique.mockResolvedValue({ id: 'wallet-1' });
      const items = Array.from({ length: 20 }, (_, i) => ({ id: `tx-${i}` }));
      mockPrisma.walletTransaction.findMany.mockResolvedValue(items);
      mockPrisma.walletTransaction.count.mockResolvedValue(50);

      const result = await service.getTransactions('user-1', 1, 20);

      expect(result.hasMore).toBe(true);
    });
  });

  describe('requestPayout', () => {
    it('should deduct from wallet, record referenceId, and return new balance', async () => {
      const wallet = { id: 'wallet-1', userId: 'user-1', balanceBrl: 250.0 };
      mockPrisma.wallet.findUnique.mockResolvedValue(wallet);
      mockPrisma.$transaction.mockResolvedValue(undefined);

      const result = await service.requestPayout('user-1', 100, 'method-1');

      expect(result).toEqual({ success: true, newBalance: 150 });
      expect(mockPayoutMethods.getOwnedOrThrow).toHaveBeenCalledWith('user-1', 'method-1');
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it('should reject if amount is below minimum', async () => {
      const wallet = { id: 'wallet-1', userId: 'user-1', balanceBrl: 250.0 };
      mockPrisma.wallet.findUnique.mockResolvedValue(wallet);

      await expect(service.requestPayout('user-1', 5, 'method-1')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.requestPayout('user-1', 5, 'method-1')).rejects.toThrow(
        'Valor mínimo para saque: R$10',
      );
    });

    it('should reject if insufficient balance', async () => {
      const wallet = { id: 'wallet-1', userId: 'user-1', balanceBrl: 50.0 };
      mockPrisma.wallet.findUnique.mockResolvedValue(wallet);

      await expect(service.requestPayout('user-1', 100, 'method-1')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.requestPayout('user-1', 100, 'method-1')).rejects.toThrow(
        'Saldo insuficiente',
      );
    });

    it('should reject if wallet not found', async () => {
      mockPrisma.wallet.findUnique.mockResolvedValue(null);

      await expect(service.requestPayout('nonexistent', 50, 'method-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should reject if the payout method belongs to another user (before debiting)', async () => {
      const wallet = { id: 'wallet-1', userId: 'user-1', balanceBrl: 250.0 };
      mockPrisma.wallet.findUnique.mockResolvedValue(wallet);
      mockPayoutMethods.getOwnedOrThrow.mockRejectedValueOnce(
        new ForbiddenException('Chave PIX não pertence a esta conta.'),
      );

      await expect(service.requestPayout('user-1', 100, 'not-mine')).rejects.toThrow(
        ForbiddenException,
      );
      // Critical: wallet MUST NOT have been debited.
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });
  });
});
