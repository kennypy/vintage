import { Test, TestingModule } from '@nestjs/testing';
import { OrdersCronService } from './orders-cron.service';
import { PrismaService } from '../prisma/prisma.service';
import { OrdersService } from './orders.service';
import { ListingsService } from '../listings/listings.service';
import { CronLockService } from '../common/services/cron-lock.service';
import { MercadoPagoClient } from '../payments/mercadopago.client';
import { ConfigService } from '@nestjs/config';

jest.mock('@vintage/shared', () => ({
  SHIPPING_DEADLINE_DAYS: 5,
  RETURN_INSPECTION_DAYS: 3,
}));

// Each cron entry uses CronLock.acquire to keep multiple replicas from
// firing the same effect twice. We default the lock to true so the body
// runs; individual tests flip it to false to assert the early-exit branch.

describe('OrdersCronService', () => {
  let service: OrdersCronService;
  let prisma: {
    order: { findMany: jest.Mock; updateMany: jest.Mock; update: jest.Mock };
    orderReturn: { findMany: jest.Mock; update: jest.Mock };
    dispute: { findUnique: jest.Mock; create: jest.Mock };
    wallet: { findUnique: jest.Mock; update: jest.Mock; upsert: jest.Mock };
    walletTransaction: { create: jest.Mock };
    listing: { update: jest.Mock };
    orderListingSnapshot: { deleteMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let ordersService: { enterHold: jest.Mock; finalizeEscrow: jest.Mock };
  let listings: { syncSearchIndex: jest.Mock };
  let cronLock: { acquire: jest.Mock };
  let mercadoPago: { refundPayment: jest.Mock };

  beforeEach(async () => {
    const txMethods = {
      order: { updateMany: jest.fn().mockResolvedValue({ count: 1 }), update: jest.fn() },
      orderReturn: { update: jest.fn() },
      dispute: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
      wallet: {
        findUnique: jest.fn().mockResolvedValue({ id: 'w1', userId: 'seller', pendingBrl: 100, balanceBrl: 0 }),
        update: jest.fn(),
        upsert: jest.fn().mockResolvedValue({ id: 'wB', userId: 'buyer', balanceBrl: 0, pendingBrl: 0 }),
      },
      walletTransaction: { create: jest.fn() },
      listing: { update: jest.fn() },
      orderListingSnapshot: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    prisma = {
      order: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn(), update: jest.fn() },
      orderReturn: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
      dispute: { findUnique: jest.fn(), create: jest.fn() },
      wallet: { findUnique: jest.fn(), update: jest.fn(), upsert: jest.fn() },
      walletTransaction: { create: jest.fn() },
      listing: { update: jest.fn() },
      orderListingSnapshot: { deleteMany: jest.fn() },
      $transaction: jest.fn(async (cb: (tx: typeof txMethods) => Promise<unknown>) => cb(txMethods)),
    };
    ordersService = {
      enterHold: jest.fn().mockResolvedValue(undefined),
      finalizeEscrow: jest.fn().mockResolvedValue(undefined),
    };
    listings = { syncSearchIndex: jest.fn().mockResolvedValue(undefined) };
    cronLock = { acquire: jest.fn().mockResolvedValue(true) };
    mercadoPago = {
      refundPayment: jest.fn().mockResolvedValue({ status: 'approved' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersCronService,
        { provide: PrismaService, useValue: prisma },
        { provide: OrdersService, useValue: ordersService },
        { provide: ListingsService, useValue: listings },
        { provide: CronLockService, useValue: cronLock },
        { provide: MercadoPagoClient, useValue: mercadoPago },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((_key: string, defaultValue?: unknown) => defaultValue),
          },
        },
      ],
    }).compile();
    service = module.get(OrdersCronService);
  });

  describe('autoConfirmOrders', () => {
    it('skips when cron lock is held by another instance', async () => {
      cronLock.acquire.mockResolvedValue(false);
      await service.autoConfirmOrders();
      expect(prisma.order.findMany).not.toHaveBeenCalled();
    });

    it('calls enterHold for every order past dispute deadline', async () => {
      prisma.order.findMany.mockResolvedValue([{ id: 'o1' }, { id: 'o2' }]);
      await service.autoConfirmOrders();
      expect(ordersService.enterHold).toHaveBeenCalledTimes(2);
      expect(ordersService.enterHold).toHaveBeenCalledWith('o1');
      expect(ordersService.enterHold).toHaveBeenCalledWith('o2');
    });

    it('continues processing the rest when one order errors', async () => {
      prisma.order.findMany.mockResolvedValue([{ id: 'o1' }, { id: 'o2' }]);
      ordersService.enterHold.mockRejectedValueOnce(new Error('boom'));
      await service.autoConfirmOrders();
      expect(ordersService.enterHold).toHaveBeenCalledTimes(2);
    });

    it('is a no-op when there are no eligible orders', async () => {
      prisma.order.findMany.mockResolvedValue([]);
      await service.autoConfirmOrders();
      expect(ordersService.enterHold).not.toHaveBeenCalled();
    });
  });

  describe('releaseHeldEscrow', () => {
    it('calls finalizeEscrow for every order past escrow hold', async () => {
      prisma.order.findMany.mockResolvedValue([{ id: 'o1' }, { id: 'o2' }, { id: 'o3' }]);
      await service.releaseHeldEscrow();
      expect(ordersService.finalizeEscrow).toHaveBeenCalledTimes(3);
    });

    it('respects the lock', async () => {
      cronLock.acquire.mockResolvedValue(false);
      await service.releaseHeldEscrow();
      expect(prisma.order.findMany).not.toHaveBeenCalled();
    });

    it('is resilient to a single finalizeEscrow failure', async () => {
      prisma.order.findMany.mockResolvedValue([{ id: 'o1' }, { id: 'o2' }]);
      ordersService.finalizeEscrow.mockRejectedValueOnce(new Error('db down'));
      await service.releaseHeldEscrow();
      expect(ordersService.finalizeEscrow).toHaveBeenCalledTimes(2);
    });
  });

  describe('autoCancelUnshippedOrders', () => {
    const stale = {
      id: 'o-stale',
      buyerId: 'buyer',
      sellerId: 'seller',
      listingId: 'l1',
      itemPriceBrl: '100.00',
      totalBrl: '110.00',
      listing: { id: 'l1', title: 'Vestido' },
    };

    it('reverses escrow + refunds buyer + reactivates listing in one transaction', async () => {
      prisma.order.findMany.mockResolvedValue([stale]);
      await service.autoCancelUnshippedOrders();
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      // syncSearchIndex is fire-and-forget; assert it was scheduled.
      expect(listings.syncSearchIndex).toHaveBeenCalledWith('l1');
    });

    it('skips silently when the order moved out of PAID under us (race)', async () => {
      prisma.order.findMany.mockResolvedValue([stale]);
      // Make the conditional updateMany inside the transaction return 0
      // so the OrderStateRaceSignal sentinel fires.
      prisma.$transaction.mockImplementationOnce(async (cb: (tx: unknown) => Promise<unknown>) =>
        cb({
          order: { updateMany: jest.fn().mockResolvedValue({ count: 0 }), update: jest.fn() },
          wallet: { findUnique: jest.fn(), update: jest.fn(), upsert: jest.fn() },
          walletTransaction: { create: jest.fn() },
          listing: { update: jest.fn() },
          orderListingSnapshot: { deleteMany: jest.fn() },
        }),
      );
      await expect(service.autoCancelUnshippedOrders()).resolves.toBeUndefined();
      // Race ⇒ no search-index sync.
      expect(listings.syncSearchIndex).not.toHaveBeenCalled();
    });

    it('respects the lock', async () => {
      cronLock.acquire.mockResolvedValue(false);
      await service.autoCancelUnshippedOrders();
      expect(prisma.order.findMany).not.toHaveBeenCalled();
    });

    // Captures the data passed to the conditional order flip so we can
    // assert which refund path was recorded.
    function captureCancelData() {
      const captured: { value?: Record<string, unknown> } = {};
      prisma.$transaction.mockImplementation(
        async (cb: (tx: unknown) => Promise<unknown>) =>
          cb({
            order: {
              updateMany: jest.fn(async (args: { data: Record<string, unknown> }) => {
                captured.value = args.data;
                return { count: 1 };
              }),
              update: jest.fn(),
            },
            wallet: {
              findUnique: jest.fn().mockResolvedValue(null),
              update: jest.fn(),
              upsert: jest.fn().mockResolvedValue({ id: 'wB' }),
            },
            walletTransaction: { create: jest.fn() },
            listing: { update: jest.fn() },
            orderListingSnapshot: { deleteMany: jest.fn() },
          }),
      );
      return captured;
    }

    it('refunds to the original payment method and records ORIGINAL_PAYMENT', async () => {
      const withPayment = { ...stale, paymentId: 'mp-1' };
      prisma.order.findMany.mockResolvedValue([withPayment]);
      const captured = captureCancelData();

      await service.autoCancelUnshippedOrders();

      expect(mercadoPago.refundPayment).toHaveBeenCalledWith('mp-1', 110);
      expect(captured.value?.status).toBe('CANCELLED');
      expect(captured.value?.refundMethod).toBe('ORIGINAL_PAYMENT');
    });

    it('falls back to WALLET_CREDIT when the source refund fails', async () => {
      const withPayment = { ...stale, paymentId: 'mp-2' };
      prisma.order.findMany.mockResolvedValue([withPayment]);
      mercadoPago.refundPayment.mockRejectedValueOnce(new Error('MP down'));
      const captured = captureCancelData();

      await service.autoCancelUnshippedOrders();

      expect(mercadoPago.refundPayment).toHaveBeenCalledWith('mp-2', 110);
      expect(captured.value?.refundMethod).toBe('WALLET_CREDIT');
    });

    it('skips the provider refund entirely when the order has no paymentId', async () => {
      prisma.order.findMany.mockResolvedValue([stale]); // no paymentId
      await service.autoCancelUnshippedOrders();
      expect(mercadoPago.refundPayment).not.toHaveBeenCalled();
    });
  });

  describe('cancelStalePendingOrders', () => {
    const dead = { id: 'o-pending', listingId: 'l9' };

    it('cancels the order, reactivates the listing, and re-indexes it', async () => {
      prisma.order.findMany.mockResolvedValue([dead]);

      await service.cancelStalePendingOrders();

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(listings.syncSearchIndex).toHaveBeenCalledWith('l9');
    });

    it('only targets PENDING orders with no in-flight or succeeded payment', async () => {
      prisma.order.findMany.mockResolvedValue([]);

      await service.cancelStalePendingOrders();

      const where = prisma.order.findMany.mock.calls[0][0].where;
      expect(where.status).toBe('PENDING');
      expect(where.createdAt.lt).toBeInstanceOf(Date);
      expect(where.payments).toEqual({
        none: { status: { in: ['PENDING', 'SUCCEEDED'] } },
      });
    });

    it('skips silently when the order left PENDING under us (late settlement race)', async () => {
      prisma.order.findMany.mockResolvedValue([dead]);
      prisma.$transaction.mockImplementationOnce(
        async (cb: (tx: unknown) => Promise<unknown>) =>
          cb({
            order: { updateMany: jest.fn().mockResolvedValue({ count: 0 }), update: jest.fn() },
            listing: { update: jest.fn() },
            orderListingSnapshot: { deleteMany: jest.fn() },
          }),
      );

      await expect(service.cancelStalePendingOrders()).resolves.toBeUndefined();
      // Race ⇒ the listing was NOT reactivated / re-indexed.
      expect(listings.syncSearchIndex).not.toHaveBeenCalled();
    });

    it('respects the lock', async () => {
      cronLock.acquire.mockResolvedValue(false);
      await service.cancelStalePendingOrders();
      expect(prisma.order.findMany).not.toHaveBeenCalled();
    });
  });

  describe('escalateStaleReturns', () => {
    const stale = {
      id: 'r1',
      requestedById: 'buyer',
      reason: 'NOT_AS_DESCRIBED',
      description: 'item arrived torn',
      order: { id: 'o-1' },
    };

    it('flips status to DISPUTED and opens a Dispute when none exists', async () => {
      prisma.orderReturn.findMany.mockResolvedValue([stale]);
      await service.escalateStaleReturns();
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('does not open a duplicate Dispute if one already exists for the order', async () => {
      prisma.orderReturn.findMany.mockResolvedValue([stale]);
      const txMethods = {
        order: { update: jest.fn() },
        orderReturn: { update: jest.fn() },
        dispute: {
          findUnique: jest.fn().mockResolvedValue({ id: 'existing-dispute' }),
          create: jest.fn(),
        },
      };
      prisma.$transaction.mockImplementationOnce(async (cb: (tx: typeof txMethods) => Promise<unknown>) =>
        cb(txMethods),
      );
      await service.escalateStaleReturns();
      expect(txMethods.dispute.create).not.toHaveBeenCalled();
    });

    it('respects the lock', async () => {
      cronLock.acquire.mockResolvedValue(false);
      await service.escalateStaleReturns();
      expect(prisma.orderReturn.findMany).not.toHaveBeenCalled();
    });
  });

  describe('escalateStuckShipments', () => {
    const stuckOrder = {
      id: 'o-stuck',
      buyerId: 'buyer',
      trackingCode: 'BR123',
      carrier: 'CORREIOS',
    };

    // tx handle exposing the calls this cron makes, so we can assert the
    // dispute is opened NOT_RECEIVED on the buyer's behalf.
    function txWithDispute(claimCount: number, existingDispute: unknown = null) {
      const create = jest.fn();
      const updateMany = jest.fn().mockResolvedValue({ count: claimCount });
      prisma.$transaction.mockImplementation(
        async (cb: (tx: unknown) => Promise<unknown>) =>
          cb({
            order: { updateMany, update: jest.fn() },
            dispute: {
              findUnique: jest.fn().mockResolvedValue(existingDispute),
              create,
            },
          }),
      );
      return { create, updateMany };
    }

    it('only targets SHIPPED orders older than the threshold with no dispute', async () => {
      prisma.order.findMany.mockResolvedValue([]);
      await service.escalateStuckShipments();
      const where = prisma.order.findMany.mock.calls[0][0].where;
      expect(where.status).toBe('SHIPPED');
      expect(where.shippedAt.lt).toBeInstanceOf(Date);
      expect(where.dispute).toEqual({ is: null });
      // Default threshold is 30 days.
      const ageMs = Date.now() - where.shippedAt.lt.getTime();
      expect(ageMs).toBeGreaterThanOrEqual(30 * 24 * 60 * 60 * 1000 - 2000);
    });

    it('opens a NOT_RECEIVED dispute on the buyer’s behalf and flips to DISPUTED', async () => {
      prisma.order.findMany.mockResolvedValue([stuckOrder]);
      const { create, updateMany } = txWithDispute(1);

      await service.escalateStuckShipments();

      expect(updateMany).toHaveBeenCalledWith({
        where: { id: 'o-stuck', status: 'SHIPPED' },
        data: { status: 'DISPUTED' },
      });
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            orderId: 'o-stuck',
            openedById: 'buyer',
            reason: 'NOT_RECEIVED',
            status: 'OPEN',
          }),
        }),
      );
    });

    it('skips (no dispute created) when the order left SHIPPED under us', async () => {
      prisma.order.findMany.mockResolvedValue([stuckOrder]);
      const { create } = txWithDispute(0); // conditional flip matched nothing

      await service.escalateStuckShipments();

      expect(create).not.toHaveBeenCalled();
    });

    it('does not open a second dispute if one already exists', async () => {
      prisma.order.findMany.mockResolvedValue([stuckOrder]);
      const { create } = txWithDispute(1, { id: 'existing' });

      await service.escalateStuckShipments();

      expect(create).not.toHaveBeenCalled();
    });

    it('respects the lock', async () => {
      cronLock.acquire.mockResolvedValue(false);
      await service.escalateStuckShipments();
      expect(prisma.order.findMany).not.toHaveBeenCalled();
    });
  });
});
