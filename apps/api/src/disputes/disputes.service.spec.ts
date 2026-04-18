import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/client';
import { DisputesService } from './disputes.service';
import { PrismaService } from '../prisma/prisma.service';
import { DisputeReason } from './dto/create-dispute.dto';

jest.mock('@vintage/shared', () => ({
  DISPUTE_WINDOW_DAYS: 7,
}));

const mockPrisma = {
  order: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  dispute: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
  },
  wallet: {
    upsert: jest.fn(),
    update: jest.fn(),
  },
  walletTransaction: {
    create: jest.fn(),
  },
  $transaction: jest.fn(),
};

describe('DisputesService', () => {
  let service: DisputesService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DisputesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<DisputesService>(DisputesService);
  });

  describe('create', () => {
    const createDto = {
      orderId: 'order-1',
      reason: DisputeReason.NOT_AS_DESCRIBED,
      description: 'Item veio com defeito',
    };

    const deliveredAt = new Date();
    deliveredAt.setDate(deliveredAt.getDate() - 2); // 2 days ago

    const mockOrder = {
      id: 'order-1',
      buyerId: 'buyer-1',
      sellerId: 'seller-1',
      status: 'DELIVERED',
      deliveredAt,
      dispute: null,
      totalBrl: new Decimal(150),
      itemPriceBrl: new Decimal(120),
    };

    it('should create a dispute for a delivered order', async () => {
      mockPrisma.order.findUnique.mockResolvedValue(mockOrder);
      const createdDispute = { id: 'dispute-1', orderId: 'order-1', status: 'OPEN' };

      const mockTx = {
        dispute: { create: jest.fn().mockResolvedValue(createdDispute) },
        order: { update: jest.fn().mockResolvedValue({}) },
      };
      mockPrisma.$transaction.mockImplementation((cb: any) => cb(mockTx));

      const result = await service.create('buyer-1', createDto);

      expect(result).toEqual(createdDispute);
      expect(mockTx.order.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'DISPUTED' } }),
      );
    });

    it('should reject if order is not DELIVERED', async () => {
      mockPrisma.order.findUnique.mockResolvedValue({ ...mockOrder, status: 'PENDING' });

      await expect(service.create('buyer-1', createDto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.create('buyer-1', createDto)).rejects.toThrow(
        'Disputas só podem ser abertas após a entrega do pedido',
      );
    });

    it('should reject if user is not the buyer', async () => {
      mockPrisma.order.findUnique.mockResolvedValue(mockOrder);

      await expect(service.create('other-user', createDto)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(service.create('other-user', createDto)).rejects.toThrow(
        'Apenas o comprador pode abrir uma disputa',
      );
    });

    it('should reject if dispute window has expired', async () => {
      const oldDeliveredAt = new Date();
      oldDeliveredAt.setDate(oldDeliveredAt.getDate() - 10); // 10 days ago, past the 7-day window
      mockPrisma.order.findUnique.mockResolvedValue({
        ...mockOrder,
        deliveredAt: oldDeliveredAt,
      });

      await expect(service.create('buyer-1', createDto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.create('buyer-1', createDto)).rejects.toThrow(
        'O prazo de 7 dias para abrir disputa expirou',
      );
    });

    it('should reject if dispute already exists for the order', async () => {
      mockPrisma.order.findUnique.mockResolvedValue({
        ...mockOrder,
        dispute: { id: 'existing-dispute' },
      });

      await expect(service.create('buyer-1', createDto)).rejects.toThrow(
        ConflictException,
      );
      await expect(service.create('buyer-1', createDto)).rejects.toThrow(
        'Já existe uma disputa aberta para este pedido',
      );
    });

    it('should reject if order not found', async () => {
      mockPrisma.order.findUnique.mockResolvedValue(null);

      await expect(service.create('buyer-1', createDto)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.create('buyer-1', createDto)).rejects.toThrow(
        'Pedido não encontrado',
      );
    });
  });

  describe('findUserDisputes', () => {
    it('should return paginated disputes', async () => {
      const disputes = [{ id: 'dispute-1', status: 'OPEN' }];
      mockPrisma.dispute.findMany.mockResolvedValue(disputes);
      mockPrisma.dispute.count.mockResolvedValue(1);

      const result = await service.findUserDisputes('buyer-1', 1, 20);

      expect(result).toEqual({
        items: disputes,
        total: 1,
        page: 1,
        pageSize: 20,
        hasMore: false,
      });
    });
  });

  describe('resolve', () => {
    const mockDispute = {
      id: 'dispute-1',
      orderId: 'order-1',
      status: 'OPEN',
      order: {
        id: 'order-1',
        buyerId: 'buyer-1',
        sellerId: 'seller-1',
        totalBrl: new Decimal(150),
        itemPriceBrl: new Decimal(120),
        listing: { title: 'Camisa Vintage' },
      },
    };

    it('should resolve with refund: create wallet transaction for buyer', async () => {
      mockPrisma.dispute.findUnique.mockResolvedValue(mockDispute);

      const resolvedDispute = { ...mockDispute, status: 'RESOLVED', resolution: 'Reembolso aprovado' };
      const mockTx = {
        dispute: { update: jest.fn().mockResolvedValue(resolvedDispute) },
        order: { update: jest.fn().mockResolvedValue({}) },
        wallet: {
          upsert: jest.fn().mockResolvedValue({ id: 'wallet-1', userId: 'buyer-1' }),
          update: jest.fn().mockResolvedValue({}),
        },
        walletTransaction: { create: jest.fn().mockResolvedValue({}) },
      };
      mockPrisma.$transaction.mockImplementation((cb: any) => cb(mockTx));

      const result = await service.resolve('dispute-1', 'Reembolso aprovado', true);

      expect(result).toEqual(resolvedDispute);
      expect(mockTx.order.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'REFUNDED' } }),
      );
      expect(mockTx.wallet.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { balanceBrl: { increment: 150 } },
        }),
      );
      expect(mockTx.walletTransaction.create).toHaveBeenCalled();
    });

    it('should resolve without refund: complete order and credit seller', async () => {
      mockPrisma.dispute.findUnique.mockResolvedValue(mockDispute);

      const resolvedDispute = { ...mockDispute, status: 'RESOLVED', resolution: 'Em favor do vendedor' };
      const mockTx = {
        dispute: { update: jest.fn().mockResolvedValue(resolvedDispute) },
        order: { update: jest.fn().mockResolvedValue({}) },
        wallet: {
          upsert: jest.fn().mockResolvedValue({ id: 'wallet-2', userId: 'seller-1' }),
          update: jest.fn().mockResolvedValue({}),
        },
        walletTransaction: { create: jest.fn().mockResolvedValue({}) },
      };
      mockPrisma.$transaction.mockImplementation((cb: any) => cb(mockTx));

      const result = await service.resolve('dispute-1', 'Em favor do vendedor', false);

      expect(result).toEqual(resolvedDispute);
      expect(mockTx.order.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'COMPLETED' }),
        }),
      );
      expect(mockTx.wallet.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            pendingBrl: { decrement: 120 },
            balanceBrl: { increment: 120 },
          },
        }),
      );
    });

    it('should throw NotFoundException if dispute not found', async () => {
      mockPrisma.dispute.findUnique.mockResolvedValue(null);

      await expect(service.resolve('nonexistent', 'test', true)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.resolve('nonexistent', 'test', true)).rejects.toThrow(
        'Disputa não encontrada',
      );
    });

    it('should throw BadRequestException if dispute already resolved', async () => {
      mockPrisma.dispute.findUnique.mockResolvedValue({ ...mockDispute, status: 'RESOLVED' });

      await expect(service.resolve('dispute-1', 'test', true)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.resolve('dispute-1', 'test', true)).rejects.toThrow(
        'Esta disputa já foi resolvida',
      );
    });
  });

  // Wave 3E: admin triage queue for the /admin/disputes page. FIFO so ops
  // picks up the oldest first; the where clause must narrow to status=OPEN.
  describe('findOpenDisputes', () => {
    it('queries only OPEN disputes, ordered oldest-first', async () => {
      mockPrisma.dispute.findMany.mockResolvedValue([]);
      mockPrisma.dispute.count.mockResolvedValue(0);

      await service.findOpenDisputes(1, 20);

      expect(mockPrisma.dispute.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: 'OPEN' },
          orderBy: { createdAt: 'asc' },
        }),
      );
      expect(mockPrisma.dispute.count).toHaveBeenCalledWith({
        where: { status: 'OPEN' },
      });
    });

    it('returns items with pagination metadata', async () => {
      mockPrisma.dispute.findMany.mockResolvedValue([{ id: 'd1' }, { id: 'd2' }]);
      mockPrisma.dispute.count.mockResolvedValue(2);

      const out = await service.findOpenDisputes(1, 20);
      expect(out.items.length).toBe(2);
      expect(out.total).toBe(2);
      expect(out.hasMore).toBe(false);
    });
  });
});
