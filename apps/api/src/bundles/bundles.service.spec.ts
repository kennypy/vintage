import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/client';
import { BundlesService } from './bundles.service';
import { PrismaService } from '../prisma/prisma.service';

jest.mock('@vintage/shared', () => ({
  BUYER_PROTECTION_FIXED_BRL: 3.5,
  BUYER_PROTECTION_RATE: 0.05,
}));

const mockPrisma = {
  listing: {
    findMany: jest.fn(),
    update: jest.fn(),
  },
  bundle: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
  bundleItem: {
    delete: jest.fn(),
  },
  address: {
    findUnique: jest.fn(),
  },
  order: {
    create: jest.fn(),
  },
  $transaction: jest.fn(),
};

describe('BundlesService', () => {
  let service: BundlesService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BundlesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<BundlesService>(BundlesService);
  });

  describe('create', () => {
    const createDto = {
      sellerId: 'seller-1',
      listingIds: ['listing-1', 'listing-2'],
    };

    const mockListings = [
      { id: 'listing-1', sellerId: 'seller-1', status: 'ACTIVE', priceBrl: new Decimal(100) },
      { id: 'listing-2', sellerId: 'seller-1', status: 'ACTIVE', priceBrl: new Decimal(200) },
    ];

    it('should create a bundle with valid listings', async () => {
      mockPrisma.listing.findMany.mockResolvedValue(mockListings);
      const createdBundle = { id: 'bundle-1', buyerId: 'buyer-1', sellerId: 'seller-1', items: [] };
      mockPrisma.bundle.create.mockResolvedValue(createdBundle);

      const result = await service.create('buyer-1', createDto);

      expect(result).toEqual(createdBundle);
      expect(mockPrisma.bundle.create).toHaveBeenCalled();
    });

    it('should reject if listings are not all active', async () => {
      mockPrisma.listing.findMany.mockResolvedValue([
        { ...mockListings[0] },
        { ...mockListings[1], status: 'SOLD' },
      ]);

      await expect(service.create('buyer-1', createDto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.create('buyer-1', createDto)).rejects.toThrow(
        'Todos os anúncios devem estar ativos',
      );
    });

    it('should reject if listings belong to different sellers', async () => {
      mockPrisma.listing.findMany.mockResolvedValue([
        { ...mockListings[0] },
        { ...mockListings[1], sellerId: 'seller-2' },
      ]);

      await expect(service.create('buyer-1', createDto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.create('buyer-1', createDto)).rejects.toThrow(
        'Todos os anúncios devem ser do mesmo vendedor',
      );
    });

    it('should reject if buyer is the seller (own listings)', async () => {
      mockPrisma.listing.findMany.mockResolvedValue(mockListings);

      await expect(service.create('seller-1', createDto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.create('seller-1', createDto)).rejects.toThrow(
        'Você não pode criar um pacote com seus próprios anúncios',
      );
    });

    it('should reject if some listings are not found', async () => {
      mockPrisma.listing.findMany.mockResolvedValue([mockListings[0]]);

      await expect(service.create('buyer-1', createDto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.create('buyer-1', createDto)).rejects.toThrow(
        'Um ou mais anúncios não foram encontrados',
      );
    });
  });

  describe('getBundle', () => {
    it('should return the bundle for the buyer', async () => {
      const bundle = { id: 'bundle-1', buyerId: 'buyer-1', sellerId: 'seller-1', items: [] };
      mockPrisma.bundle.findUnique.mockResolvedValue(bundle);

      const result = await service.getBundle('bundle-1', 'buyer-1');

      expect(result).toEqual(bundle);
    });

    it('should return the bundle for the seller', async () => {
      const bundle = { id: 'bundle-1', buyerId: 'buyer-1', sellerId: 'seller-1', items: [] };
      mockPrisma.bundle.findUnique.mockResolvedValue(bundle);

      const result = await service.getBundle('bundle-1', 'seller-1');

      expect(result).toEqual(bundle);
    });

    it('should throw NotFoundException if bundle not found', async () => {
      mockPrisma.bundle.findUnique.mockResolvedValue(null);

      await expect(service.getBundle('nonexistent', 'buyer-1')).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.getBundle('nonexistent', 'buyer-1')).rejects.toThrow(
        'Pacote não encontrado',
      );
    });

    it('should throw ForbiddenException if user is neither buyer nor seller', async () => {
      const bundle = { id: 'bundle-1', buyerId: 'buyer-1', sellerId: 'seller-1', items: [] };
      mockPrisma.bundle.findUnique.mockResolvedValue(bundle);

      await expect(service.getBundle('bundle-1', 'other-user')).rejects.toThrow(
        ForbiddenException,
      );
      await expect(service.getBundle('bundle-1', 'other-user')).rejects.toThrow(
        'Você não tem acesso a este pacote',
      );
    });
  });

  describe('getUserBundles', () => {
    it('should return user bundles ordered by createdAt desc', async () => {
      const bundles = [
        { id: 'bundle-2', buyerId: 'buyer-1', items: [] },
        { id: 'bundle-1', buyerId: 'buyer-1', items: [] },
      ];
      mockPrisma.bundle.findMany.mockResolvedValue(bundles);

      const result = await service.getUserBundles('buyer-1');

      expect(result).toEqual(bundles);
      expect(mockPrisma.bundle.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { buyerId: 'buyer-1' },
          orderBy: { createdAt: 'desc' },
        }),
      );
    });
  });

  describe('removeItem', () => {
    it('should reject if bundle has only 2 items (minimum)', async () => {
      const bundle = {
        id: 'bundle-1',
        buyerId: 'buyer-1',
        status: 'OPEN',
        items: [
          { listingId: 'listing-1' },
          { listingId: 'listing-2' },
        ],
      };
      mockPrisma.bundle.findUnique.mockResolvedValue(bundle);

      await expect(
        service.removeItem('bundle-1', 'listing-1', 'buyer-1'),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.removeItem('bundle-1', 'listing-1', 'buyer-1'),
      ).rejects.toThrow('Um pacote deve ter pelo menos 2 anúncios');
    });

    it('should reject if bundle is not OPEN', async () => {
      const bundle = {
        id: 'bundle-1',
        buyerId: 'buyer-1',
        status: 'CHECKED_OUT',
        items: [
          { listingId: 'listing-1' },
          { listingId: 'listing-2' },
          { listingId: 'listing-3' },
        ],
      };
      mockPrisma.bundle.findUnique.mockResolvedValue(bundle);

      await expect(
        service.removeItem('bundle-1', 'listing-1', 'buyer-1'),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.removeItem('bundle-1', 'listing-1', 'buyer-1'),
      ).rejects.toThrow('Não é possível editar um pacote que já foi finalizado');
    });

    it('should reject if user is not the buyer (forbidden)', async () => {
      const bundle = {
        id: 'bundle-1',
        buyerId: 'buyer-1',
        status: 'OPEN',
        items: [
          { listingId: 'listing-1' },
          { listingId: 'listing-2' },
          { listingId: 'listing-3' },
        ],
      };
      mockPrisma.bundle.findUnique.mockResolvedValue(bundle);

      await expect(
        service.removeItem('bundle-1', 'listing-1', 'other-user'),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.removeItem('bundle-1', 'listing-1', 'other-user'),
      ).rejects.toThrow('Apenas o comprador pode remover itens do pacote');
    });

    it('should remove item from bundle with more than 2 items', async () => {
      const bundle = {
        id: 'bundle-1',
        buyerId: 'buyer-1',
        sellerId: 'seller-1',
        status: 'OPEN',
        items: [
          { listingId: 'listing-1' },
          { listingId: 'listing-2' },
          { listingId: 'listing-3' },
        ],
      };
      mockPrisma.bundle.findUnique
        .mockResolvedValueOnce(bundle)
        .mockResolvedValueOnce({ ...bundle, items: bundle.items.slice(1) });
      mockPrisma.bundleItem.delete.mockResolvedValue({});

      const result = await service.removeItem('bundle-1', 'listing-1', 'buyer-1');

      expect(mockPrisma.bundleItem.delete).toHaveBeenCalledWith({
        where: { bundleId_listingId: { bundleId: 'bundle-1', listingId: 'listing-1' } },
      });
      expect(result).toBeDefined();
    });
  });

  describe('checkoutBundle', () => {
    it('should create orders, mark listings SOLD, and mark bundle CHECKED_OUT', async () => {
      const bundle = {
        id: 'bundle-1',
        buyerId: 'buyer-1',
        sellerId: 'seller-1',
        status: 'OPEN',
        items: [
          { listingId: 'listing-1', listing: { id: 'listing-1', status: 'ACTIVE', priceBrl: new Decimal(100), shippingWeightG: 500 } },
          { listingId: 'listing-2', listing: { id: 'listing-2', status: 'ACTIVE', priceBrl: new Decimal(200), shippingWeightG: 300 } },
        ],
      };
      mockPrisma.bundle.findUnique.mockResolvedValue(bundle);
      mockPrisma.address.findUnique.mockResolvedValue({ id: 'addr-1', userId: 'buyer-1' });

      const mockTx = {
        listing: { findMany: jest.fn(), update: jest.fn() },
        order: { create: jest.fn() },
        bundle: { update: jest.fn() },
      };
      mockTx.listing.findMany.mockResolvedValue([
        { id: 'listing-1', status: 'ACTIVE' },
        { id: 'listing-2', status: 'ACTIVE' },
      ]);
      const order1 = { id: 'order-1', listingId: 'listing-1', status: 'PENDING' };
      const order2 = { id: 'order-2', listingId: 'listing-2', status: 'PENDING' };
      mockTx.order.create
        .mockResolvedValueOnce(order1)
        .mockResolvedValueOnce(order2);
      mockTx.listing.update.mockResolvedValue({});
      mockTx.bundle.update.mockResolvedValue({});

      mockPrisma.$transaction.mockImplementation((cb: any) => cb(mockTx));

      const result = await service.checkoutBundle('bundle-1', 'buyer-1', 'addr-1', 'PIX');

      expect(result.bundleId).toBe('bundle-1');
      expect(result.orders).toHaveLength(2);
      expect(mockTx.listing.update).toHaveBeenCalledTimes(2);
      expect(mockTx.listing.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'SOLD' } }),
      );
      expect(mockTx.bundle.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'CHECKED_OUT' } }),
      );
    });

    it('should throw NotFoundException if bundle not found', async () => {
      mockPrisma.bundle.findUnique.mockResolvedValue(null);

      await expect(
        service.checkoutBundle('nonexistent', 'buyer-1', 'addr-1', 'PIX'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user is not the buyer', async () => {
      const bundle = { id: 'bundle-1', buyerId: 'buyer-1', sellerId: 'seller-1', status: 'OPEN', items: [] };
      mockPrisma.bundle.findUnique.mockResolvedValue(bundle);

      await expect(
        service.checkoutBundle('bundle-1', 'other-user', 'addr-1', 'PIX'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException if bundle is not OPEN', async () => {
      const bundle = { id: 'bundle-1', buyerId: 'buyer-1', sellerId: 'seller-1', status: 'CHECKED_OUT', items: [] };
      mockPrisma.bundle.findUnique.mockResolvedValue(bundle);

      await expect(
        service.checkoutBundle('bundle-1', 'buyer-1', 'addr-1', 'PIX'),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.checkoutBundle('bundle-1', 'buyer-1', 'addr-1', 'PIX'),
      ).rejects.toThrow('Este pacote já foi finalizado');
    });
  });
});
