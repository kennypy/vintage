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
import { AnalyticsService } from '../analytics/analytics.service';
import { DisputeReason } from './dto/create-dispute.dto';
import { AuditLogService } from '../audit-log/audit-log.service';
import { PaymentsService } from '../payments/payments.service';

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
        { provide: AuditLogService, useValue: { record: jest.fn().mockResolvedValue(undefined) } },
        { provide: PaymentsService, useValue: { refundPayment: jest.fn().mockResolvedValue({ id: 'refund-x' }) } },
        DisputesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AnalyticsService, useValue: { capture: jest.fn() } },
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

    const makeTx = (resolvedDispute: unknown, claimCount = 1) => ({
      dispute: {
        updateMany: jest.fn().mockResolvedValue({ count: claimCount }),
        findUniqueOrThrow: jest.fn().mockResolvedValue(resolvedDispute),
      },
      order: { update: jest.fn().mockResolvedValue({}) },
      wallet: {
        upsert: jest.fn().mockResolvedValue({ id: 'wallet-1' }),
        update: jest.fn().mockResolvedValue({}),
      },
      walletTransaction: { create: jest.fn().mockResolvedValue({}) },
      orderListingSnapshot: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
    });

    it('should resolve with refund: create wallet transaction for buyer', async () => {
      mockPrisma.dispute.findUnique.mockResolvedValue(mockDispute);
      const resolvedDispute = { ...mockDispute, status: 'RESOLVED', resolution: 'Reembolso aprovado' };
      const mockTx = makeTx(resolvedDispute);
      mockPrisma.$transaction.mockImplementation((cb: any) => cb(mockTx));

      const result = await service.resolve('dispute-1', 'Reembolso aprovado', true);

      expect(result).toEqual(resolvedDispute);
      // Conditional claim: updateMany gates the status transition.
      expect(mockTx.dispute.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'dispute-1', status: 'OPEN' },
        }),
      );
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
      const mockTx = makeTx(resolvedDispute);
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

    it('refund-buyer: when MP refund succeeds, buyer wallet is NOT credited (MP handles the card refund directly)', async () => {
      // Dispute order has a paymentId, so the service should attempt
      // MP refund first and skip the wallet fallback on success.
      const disputeWithPayment = {
        ...mockDispute,
        order: { ...mockDispute.order, paymentId: 'mp-pay-123' },
      };
      mockPrisma.dispute.findUnique.mockResolvedValue(disputeWithPayment);
      const resolvedDispute = { ...disputeWithPayment, status: 'RESOLVED' };
      const mockTx = makeTx(resolvedDispute);
      // Count of $transaction calls — a successful MP refund means
      // only ONE tx runs (the seller-side escrow reversal). A
      // fallback wallet credit would open a SECOND tx.
      let txCalls = 0;
      mockPrisma.$transaction.mockImplementation((cb: any) => {
        txCalls += 1;
        return cb(mockTx);
      });

      await service.resolve('dispute-1', 'Reembolso aprovado', true);

      // PaymentsService was called with the paymentId + totalBrl.
      const paymentsStub = (service as unknown as { payments: { refundPayment: jest.Mock } })
        .payments;
      expect(paymentsStub.refundPayment).toHaveBeenCalledWith('mp-pay-123', 150);
      // Exactly one tx — no wallet-credit fallback.
      expect(txCalls).toBe(1);
    });

    it('refund-buyer: MP refund failure falls back to wallet credit + PaymentFlag', async () => {
      const disputeWithPayment = {
        ...mockDispute,
        order: { ...mockDispute.order, paymentId: 'mp-pay-456' },
      };
      mockPrisma.dispute.findUnique.mockResolvedValue(disputeWithPayment);
      const resolvedDispute = { ...disputeWithPayment, status: 'RESOLVED' };
      const mockTx = makeTx(resolvedDispute);
      // Extend makeTx with paymentFlag which the fallback writes.
      (mockTx as unknown as { paymentFlag: { create: jest.Mock } }).paymentFlag = {
        create: jest.fn().mockResolvedValue({}),
      };
      mockPrisma.$transaction.mockImplementation((cb: any) => cb(mockTx));
      const paymentsStub = (service as unknown as { payments: { refundPayment: jest.Mock } })
        .payments;
      paymentsStub.refundPayment.mockRejectedValueOnce(new Error('MP outage'));

      await service.resolve('dispute-1', 'Reembolso aprovado', true);

      // Fallback credited the buyer's wallet AND wrote a PaymentFlag.
      expect(mockTx.wallet.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { balanceBrl: { increment: 150 } } }),
      );
      expect(
        (mockTx as unknown as { paymentFlag: { create: jest.Mock } }).paymentFlag.create,
      ).toHaveBeenCalled();
    });

    it('R-01: race loser (dispute.updateMany returns count=0) throws Conflict and never credits wallet', async () => {
      mockPrisma.dispute.findUnique.mockResolvedValue(mockDispute);
      const mockTx = makeTx(null, 0); // claim count = 0 → concurrent admin already claimed
      mockPrisma.$transaction.mockImplementation((cb: any) => cb(mockTx));

      await expect(
        service.resolve('dispute-1', 'Reembolso aprovado', true),
      ).rejects.toThrow(/já está sendo resolvida|já foi resolvida/i);

      // Critical: the loser of the race must NOT credit the buyer or
      // touch seller escrow.
      expect(mockTx.wallet.update).not.toHaveBeenCalled();
      expect(mockTx.walletTransaction.create).not.toHaveBeenCalled();
      expect(mockTx.order.update).not.toHaveBeenCalled();
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
