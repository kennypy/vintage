import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/client';
import { OffersService } from './offers.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

const mockNotifications = {
  createNotification: jest.fn().mockResolvedValue(null),
};

jest.mock('@vintage/shared', () => ({
  MIN_OFFER_PERCENTAGE: 0.5,
  OFFER_EXPIRY_HOURS: 48,
  MAX_OFFER_COUNTERS: 3,
  containsProhibitedContent: jest.fn().mockReturnValue({ matched: false }),
}));

const mockPrisma: Record<string, any> = {
  listing: {
    findUnique: jest.fn(),
  },
  offer: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  user: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  userBlock: {
    findFirst: jest.fn().mockResolvedValue(null),
  },
};
mockPrisma.$transaction = jest.fn(
  async (fn: (tx: Record<string, any>) => Promise<unknown>) => fn(mockPrisma),
);

describe('OffersService', () => {
  let service: OffersService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.user.findMany.mockResolvedValue([]);
    mockPrisma.userBlock.findFirst.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OffersService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NotificationsService, useValue: mockNotifications },
      ],
    }).compile();

    service = module.get<OffersService>(OffersService);
  });

  describe('create', () => {
    const createDto = {
      listingId: 'listing-1',
      amountBrl: 80,
    };

    const mockListing = {
      id: 'listing-1',
      sellerId: 'seller-1',
      status: 'ACTIVE',
      priceBrl: new Decimal(100),
    };

    it('should create offer with valid amount', async () => {
      mockPrisma.listing.findUnique.mockResolvedValue(mockListing);
      const createdOffer = {
        id: 'offer-1',
        amountBrl: 80,
        status: 'PENDING',
      };
      mockPrisma.offer.create.mockResolvedValue(createdOffer);

      const result = await service.create('buyer-1', createDto);

      expect(result).toEqual(createdOffer);
      expect(mockPrisma.offer.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            listingId: 'listing-1',
            buyerId: 'buyer-1',
            amountBrl: 80,
            status: 'PENDING',
          }),
        }),
      );
    });

    it('should reject if amount is less than 50% of listing price', async () => {
      mockPrisma.listing.findUnique.mockResolvedValue(mockListing);

      await expect(
        service.create('buyer-1', { listingId: 'listing-1', amountBrl: 40 }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.create('buyer-1', { listingId: 'listing-1', amountBrl: 40 }),
      ).rejects.toThrow('O valor mínimo da oferta é R$ 50.00');
    });

    it('should reject if listing is not active', async () => {
      mockPrisma.listing.findUnique.mockResolvedValue({
        ...mockListing,
        status: 'SOLD',
      });

      await expect(service.create('buyer-1', createDto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.create('buyer-1', createDto)).rejects.toThrow(
        'Este anúncio não está disponível para ofertas',
      );
    });

    it('should reject offer on own listing', async () => {
      mockPrisma.listing.findUnique.mockResolvedValue(mockListing);

      await expect(service.create('seller-1', createDto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.create('seller-1', createDto)).rejects.toThrow(
        'Você não pode fazer uma oferta no seu próprio anúncio',
      );
    });

    it('should reject if listing not found', async () => {
      mockPrisma.listing.findUnique.mockResolvedValue(null);

      await expect(service.create('buyer-1', createDto)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('accept', () => {
    it('should accept a pending offer', async () => {
      const futureDate = new Date();
      futureDate.setHours(futureDate.getHours() + 24);

      mockPrisma.offer.findUnique.mockResolvedValue({
        id: 'offer-1',
        status: 'PENDING',
        expiresAt: futureDate,
        listing: { sellerId: 'seller-1' },
      });
      const acceptedOffer = { id: 'offer-1', status: 'ACCEPTED' };
      mockPrisma.offer.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.offer.findUniqueOrThrow.mockResolvedValue(acceptedOffer);

      const result = await service.accept('offer-1', 'seller-1');

      expect(result).toEqual(acceptedOffer);
      expect(mockPrisma.offer.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 'offer-1', status: 'PENDING' }),
          data: { status: 'ACCEPTED' },
        }),
      );
    });

    it('should reject if not the seller', async () => {
      mockPrisma.offer.findUnique.mockResolvedValue({
        id: 'offer-1',
        status: 'PENDING',
        listing: { sellerId: 'seller-1' },
      });

      await expect(
        service.accept('offer-1', 'other-user'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject if offer is not pending', async () => {
      mockPrisma.offer.findUnique.mockResolvedValue({
        id: 'offer-1',
        status: 'ACCEPTED',
        listing: { sellerId: 'seller-1' },
      });

      await expect(
        service.accept('offer-1', 'seller-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject if offer has expired', async () => {
      const pastDate = new Date();
      pastDate.setHours(pastDate.getHours() - 1);

      mockPrisma.offer.findUnique.mockResolvedValue({
        id: 'offer-1',
        status: 'PENDING',
        expiresAt: pastDate,
        listing: { sellerId: 'seller-1' },
      });

      await expect(
        service.accept('offer-1', 'seller-1'),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.accept('offer-1', 'seller-1'),
      ).rejects.toThrow('Esta oferta expirou');
    });

    it('should reject if offer not found', async () => {
      mockPrisma.offer.findUnique.mockResolvedValue(null);

      await expect(
        service.accept('nonexistent', 'seller-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException if a concurrent counter/reject already claimed the offer', async () => {
      // Simulate: outer `status === 'PENDING'` read passes, but another
      // party's counter() transaction commits first — our atomic
      // updateMany gate then sees status != 'PENDING' and returns
      // count=0. Without this gate the accept would silently overwrite
      // COUNTERED with ACCEPTED (last-write-wins).
      const futureDate = new Date();
      futureDate.setHours(futureDate.getHours() + 24);
      mockPrisma.offer.findUnique.mockResolvedValue({
        id: 'offer-1',
        status: 'PENDING',
        expiresAt: futureDate,
        listing: { sellerId: 'seller-1' },
      });
      mockPrisma.offer.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.accept('offer-1', 'seller-1')).rejects.toThrow(
        /já foi atualizada/i,
      );
      expect(mockPrisma.offer.findUniqueOrThrow).not.toHaveBeenCalled();
    });
  });

  describe('reject', () => {
    it('should reject a pending offer', async () => {
      mockPrisma.offer.findUnique.mockResolvedValue({
        id: 'offer-1',
        status: 'PENDING',
        listing: { sellerId: 'seller-1' },
      });
      const rejectedOffer = { id: 'offer-1', status: 'REJECTED' };
      mockPrisma.offer.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.offer.findUniqueOrThrow.mockResolvedValue(rejectedOffer);

      const result = await service.reject('offer-1', 'seller-1');

      expect(result).toEqual(rejectedOffer);
      expect(mockPrisma.offer.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 'offer-1', status: 'PENDING' }),
          data: { status: 'REJECTED' },
        }),
      );
    });

    it('should reject if not the seller', async () => {
      mockPrisma.offer.findUnique.mockResolvedValue({
        id: 'offer-1',
        status: 'PENDING',
        listing: { sellerId: 'seller-1' },
      });

      await expect(
        service.reject('offer-1', 'other-user'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject if offer is not pending', async () => {
      mockPrisma.offer.findUnique.mockResolvedValue({
        id: 'offer-1',
        status: 'REJECTED',
        listing: { sellerId: 'seller-1' },
      });

      await expect(
        service.reject('offer-1', 'seller-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject if offer not found', async () => {
      mockPrisma.offer.findUnique.mockResolvedValue(null);

      await expect(
        service.reject('nonexistent', 'seller-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('counter', () => {
    const basePrev = {
      id: 'offer-1',
      buyerId: 'buyer-1',
      listingId: 'listing-1',
      amountBrl: new Decimal('50.00'),
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 60_000),
      parentOfferId: null,
      counterCount: 0,
      counteredById: 'buyer-1',
      listing: {
        sellerId: 'seller-1',
        priceBrl: new Decimal('100.00'),
        title: 'Item',
      },
    };

    it('rejects counter when caller made the most recent offer (alternation)', async () => {
      mockPrisma.offer.findUnique.mockResolvedValue(basePrev);
      await expect(
        service.counter('offer-1', 'buyer-1', { amountBrl: 70 }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects counter when chain depth exceeds MAX_OFFER_COUNTERS', async () => {
      mockPrisma.offer.findUnique.mockResolvedValue({ ...basePrev, counterCount: 3 });
      await expect(
        service.counter('offer-1', 'seller-1', { amountBrl: 80 }),
      ).rejects.toThrow(/Limite de 3/);
    });

    it('enforces 50% floor relative to listing price', async () => {
      mockPrisma.offer.findUnique.mockResolvedValue(basePrev);
      await expect(
        service.counter('offer-1', 'seller-1', { amountBrl: 10 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates a new offer with incremented counterCount and parentOfferId', async () => {
      mockPrisma.offer.findUnique.mockResolvedValue(basePrev);
      mockPrisma.offer.updateMany.mockResolvedValue({ count: 1 });
      const newOffer = {
        id: 'offer-2',
        parentOfferId: 'offer-1',
        counterCount: 1,
        counteredById: 'seller-1',
      };
      mockPrisma.offer.create.mockResolvedValue(newOffer);

      const result = await service.counter('offer-1', 'seller-1', { amountBrl: 70 });

      expect(mockPrisma.offer.updateMany).toHaveBeenCalledWith({
        where: { id: 'offer-1', status: 'PENDING' },
        data: { status: 'COUNTERED' },
      });
      expect(mockPrisma.offer.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            parentOfferId: 'offer-1',
            counterCount: 1,
            counteredById: 'seller-1',
            amountBrl: 70,
          }),
        }),
      );
      expect(result).toEqual(newOffer);
    });
  });
});
