import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/client';
import { OrdersService } from './orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { CouponsService } from '../coupons/coupons.service';
import { NotificationsService } from '../notifications/notifications.service';

jest.mock('@vintage/shared', () => ({
  BUYER_PROTECTION_FIXED_BRL: 3.5,
  BUYER_PROTECTION_RATE: 0.05,
  DISPUTE_WINDOW_DAYS: 2,
}));

const mockTx = {
  listing: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  order: {
    create: jest.fn(),
    update: jest.fn(),
  },
  wallet: {
    upsert: jest.fn(),
    update: jest.fn(),
  },
  walletTransaction: {
    create: jest.fn(),
  },
  coupon: {
    update: jest.fn(),
  },
};

const mockCoupons = {
  validate: jest.fn(),
};

const mockNotifications = {
  createNotification: jest.fn().mockResolvedValue(undefined),
};

const mockPrisma = {
  listing: {
    findUnique: jest.fn(),
  },
  address: {
    findUnique: jest.fn(),
  },
  order: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
  },
  $transaction: jest.fn((cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx)),
};

describe('OrdersService', () => {
  let service: OrdersService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CouponsService, useValue: mockCoupons },
        { provide: NotificationsService, useValue: mockNotifications },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
  });

  describe('create', () => {
    const createDto = {
      listingId: 'listing-1',
      addressId: 'addr-1',
      paymentMethod: 'PIX',
    } as any;

    const mockListing = {
      id: 'listing-1',
      sellerId: 'seller-1',
      status: 'ACTIVE',
      priceBrl: new Decimal(100),
      shippingWeightG: 500,
      seller: { id: 'seller-1' },
    };

    it('should create order with correct totals', async () => {
      mockPrisma.listing.findUnique.mockResolvedValue(mockListing);
      mockPrisma.address.findUnique.mockResolvedValue({
        id: 'addr-1',
        userId: 'buyer-1',
      });
      mockTx.listing.findUnique.mockResolvedValue(mockListing);
      const createdOrder = {
        id: 'order-1',
        sellerId: 'seller-1',
        totalBrl: new Decimal('130.50'),
        itemPriceBrl: new Decimal('100'),
        shippingCostBrl: new Decimal('22.50'),
        buyerProtectionFeeBrl: new Decimal('8.50'),
        listing: { title: 'Vestido vintage' },
        buyer: { id: 'buyer-1', name: 'Maria' },
        seller: { id: 'seller-1', name: 'João' },
      };
      mockTx.order.create.mockResolvedValue(createdOrder);
      mockTx.listing.update.mockResolvedValue({});

      const result = await service.create('buyer-1', createDto);

      expect(result).toEqual(createdOrder);
      // itemPrice=100, shipping=22.5 (500g), protection=3.5+100*0.05=8.5, total=131.0
      expect(mockTx.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            buyerId: 'buyer-1',
            sellerId: 'seller-1',
            status: 'PENDING',
            paymentMethod: 'PIX',
          }),
        }),
      );
    });

    it('should reject self-purchase', async () => {
      mockPrisma.listing.findUnique.mockResolvedValue(mockListing);

      await expect(service.create('seller-1', createDto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.create('seller-1', createDto)).rejects.toThrow(
        'Você não pode comprar seu próprio anúncio',
      );
    });

    it('should reject if listing is not ACTIVE', async () => {
      mockPrisma.listing.findUnique.mockResolvedValue({
        ...mockListing,
        status: 'SOLD',
      });

      await expect(service.create('buyer-1', createDto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.create('buyer-1', createDto)).rejects.toThrow(
        'Este anúncio não está disponível para compra',
      );
    });

    it('should reject if listing not found', async () => {
      mockPrisma.listing.findUnique.mockResolvedValue(null);

      await expect(service.create('buyer-1', createDto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should reject if address does not belong to buyer', async () => {
      mockPrisma.listing.findUnique.mockResolvedValue(mockListing);
      mockPrisma.address.findUnique.mockResolvedValue({
        id: 'addr-1',
        userId: 'other-user',
      });

      await expect(service.create('buyer-1', createDto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.create('buyer-1', createDto)).rejects.toThrow(
        'Endereço de entrega inválido',
      );
    });

    it('should reject installments for non-credit-card payments', async () => {
      mockPrisma.listing.findUnique.mockResolvedValue(mockListing);
      mockPrisma.address.findUnique.mockResolvedValue({
        id: 'addr-1',
        userId: 'buyer-1',
      });

      await expect(
        service.create('buyer-1', { ...createDto, installments: 3 }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('markShipped', () => {
    const shipDto = {
      trackingCode: 'BR123456789',
      carrier: 'CORREIOS',
    } as any;

    it('should update order with tracking info', async () => {
      mockPrisma.order.findUnique.mockResolvedValue({
        id: 'order-1',
        sellerId: 'seller-1',
        status: 'PAID',
      });
      const shippedOrder = {
        id: 'order-1',
        buyerId: 'buyer-1',
        status: 'SHIPPED',
        trackingCode: 'BR123456789',
        listing: { title: 'Vestido vintage' },
        buyer: { id: 'buyer-1', name: 'Maria' },
        seller: { id: 'seller-1', name: 'João' },
      };
      mockPrisma.order.update.mockResolvedValue(shippedOrder);

      const result = await service.markShipped('order-1', 'seller-1', shipDto);

      expect(result).toEqual(shippedOrder);
      expect(mockPrisma.order.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'SHIPPED',
            trackingCode: 'BR123456789',
            carrier: 'CORREIOS',
          }),
        }),
      );
    });

    it('should reject if not the seller', async () => {
      mockPrisma.order.findUnique.mockResolvedValue({
        id: 'order-1',
        sellerId: 'seller-1',
        status: 'PAID',
      });

      await expect(
        service.markShipped('order-1', 'other-user', shipDto),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject if order is not PAID', async () => {
      mockPrisma.order.findUnique.mockResolvedValue({
        id: 'order-1',
        sellerId: 'seller-1',
        status: 'PENDING',
      });

      await expect(
        service.markShipped('order-1', 'seller-1', shipDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject if order not found', async () => {
      mockPrisma.order.findUnique.mockResolvedValue(null);

      await expect(
        service.markShipped('nonexistent', 'seller-1', shipDto),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('confirmReceipt', () => {
    it('should credit seller wallet on confirmation', async () => {
      mockPrisma.order.findUnique.mockResolvedValue({
        id: 'order-1',
        buyerId: 'buyer-1',
        sellerId: 'seller-1',
        status: 'SHIPPED',
        itemPriceBrl: new Decimal('100'),
      });

      const confirmedOrder = {
        id: 'order-1',
        sellerId: 'seller-1',
        status: 'COMPLETED',
        itemPriceBrl: new Decimal('100'),
        listing: { title: 'Vestido' },
      };
      mockTx.order.update.mockResolvedValue(confirmedOrder);
      mockTx.wallet.upsert.mockResolvedValue({ id: 'wallet-1', userId: 'seller-1' });
      mockTx.wallet.update.mockResolvedValue({});
      mockTx.walletTransaction.create.mockResolvedValue({});

      // Override $transaction for this test to use the callback pattern
      mockPrisma.$transaction.mockImplementation(
        (cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx),
      );

      const result = await service.confirmReceipt('order-1', 'buyer-1');

      expect(result).toEqual(confirmedOrder);
      expect(mockTx.wallet.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            pendingBrl: { decrement: 100 },
            balanceBrl: { increment: 100 },
          },
        }),
      );
      expect(mockTx.walletTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'ESCROW_RELEASE',
            walletId: 'wallet-1',
          }),
        }),
      );
    });

    it('should reject if not the buyer', async () => {
      mockPrisma.order.findUnique.mockResolvedValue({
        id: 'order-1',
        buyerId: 'buyer-1',
        sellerId: 'seller-1',
        status: 'SHIPPED',
      });

      await expect(
        service.confirmReceipt('order-1', 'other-user'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject if order is not shipped/delivered', async () => {
      mockPrisma.order.findUnique.mockResolvedValue({
        id: 'order-1',
        buyerId: 'buyer-1',
        sellerId: 'seller-1',
        status: 'PENDING',
      });

      await expect(
        service.confirmReceipt('order-1', 'buyer-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject if order not found', async () => {
      mockPrisma.order.findUnique.mockResolvedValue(null);

      await expect(
        service.confirmReceipt('nonexistent', 'buyer-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findOne', () => {
    it('should return order for buyer', async () => {
      const order = {
        id: 'order-1',
        buyerId: 'buyer-1',
        sellerId: 'seller-1',
      };
      mockPrisma.order.findUnique.mockResolvedValue(order);

      const result = await service.findOne('order-1', 'buyer-1');
      expect(result).toEqual(order);
    });

    it('should return order for seller', async () => {
      const order = {
        id: 'order-1',
        buyerId: 'buyer-1',
        sellerId: 'seller-1',
      };
      mockPrisma.order.findUnique.mockResolvedValue(order);

      const result = await service.findOne('order-1', 'seller-1');
      expect(result).toEqual(order);
    });

    it('should reject access from unrelated user', async () => {
      mockPrisma.order.findUnique.mockResolvedValue({
        id: 'order-1',
        buyerId: 'buyer-1',
        sellerId: 'seller-1',
      });

      await expect(
        service.findOne('order-1', 'other-user'),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
