import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { OffersService } from './offers.service';
import { PrismaService } from '../prisma/prisma.service';

jest.mock('@vintage/shared', () => ({
  MIN_OFFER_PERCENTAGE: 0.5,
  OFFER_EXPIRY_HOURS: 48,
}));

const mockPrisma = {
  listing: {
    findUnique: jest.fn(),
  },
  offer: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
};

describe('OffersService', () => {
  let service: OffersService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OffersService,
        { provide: PrismaService, useValue: mockPrisma },
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
      mockPrisma.offer.update.mockResolvedValue(acceptedOffer);

      const result = await service.accept('offer-1', 'seller-1');

      expect(result).toEqual(acceptedOffer);
      expect(mockPrisma.offer.update).toHaveBeenCalledWith(
        expect.objectContaining({
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
  });

  describe('reject', () => {
    it('should reject a pending offer', async () => {
      mockPrisma.offer.findUnique.mockResolvedValue({
        id: 'offer-1',
        status: 'PENDING',
        listing: { sellerId: 'seller-1' },
      });
      const rejectedOffer = { id: 'offer-1', status: 'REJECTED' };
      mockPrisma.offer.update.mockResolvedValue(rejectedOffer);

      const result = await service.reject('offer-1', 'seller-1');

      expect(result).toEqual(rejectedOffer);
      expect(mockPrisma.offer.update).toHaveBeenCalledWith(
        expect.objectContaining({
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
});
