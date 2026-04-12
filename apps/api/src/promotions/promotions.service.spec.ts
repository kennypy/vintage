import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/client';
import { PromotionsService } from './promotions.service';
import { PrismaService } from '../prisma/prisma.service';

jest.mock('@vintage/shared', () => ({
  MEGAFONE_FREE_DAYS: 7,
  BUMP_PRICE_BRL: 5.0,
  BUMP_DURATION_DAYS: 3,
  SPOTLIGHT_PRICE_BRL: 15.0,
  SPOTLIGHT_DURATION_DAYS: 7,
}));

const mockPrisma = {
  listing: {
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    aggregate: jest.fn(),
  },
  promotion: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
  },
  wallet: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  walletTransaction: {
    create: jest.fn(),
  },
  favorite: {
    count: jest.fn(),
  },
  $transaction: jest.fn(),
};

describe('PromotionsService', () => {
  let service: PromotionsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PromotionsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<PromotionsService>(PromotionsService);
  });

  describe('createMegafone', () => {
    const newListing = {
      id: 'listing-1',
      sellerId: 'user-1',
      status: 'ACTIVE',
      title: 'Camisa',
      createdAt: new Date(), // brand new listing
    };

    it('should throw NotFoundException if listing not found', async () => {
      mockPrisma.listing.findUnique.mockResolvedValue(null);

      await expect(service.createMegafone('nonexistent', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.createMegafone('nonexistent', 'user-1')).rejects.toThrow(
        'Anúncio não encontrado',
      );
    });

    it('should throw ForbiddenException if user is not the owner', async () => {
      mockPrisma.listing.findUnique.mockResolvedValue(newListing);

      await expect(service.createMegafone('listing-1', 'other-user')).rejects.toThrow(
        ForbiddenException,
      );
      await expect(service.createMegafone('listing-1', 'other-user')).rejects.toThrow(
        'Você só pode promover seus próprios anúncios',
      );
    });

    it('should throw BadRequestException if listing is not active', async () => {
      mockPrisma.listing.findUnique.mockResolvedValue({ ...newListing, status: 'SOLD' });

      await expect(service.createMegafone('listing-1', 'user-1')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.createMegafone('listing-1', 'user-1')).rejects.toThrow(
        'Apenas anúncios ativos podem ser promovidos',
      );
    });

    it('should throw BadRequestException if listing already has active megafone', async () => {
      mockPrisma.listing.findUnique.mockResolvedValue(newListing);
      mockPrisma.promotion.findFirst.mockResolvedValue({ id: 'promo-1', type: 'MEGAFONE' });

      await expect(service.createMegafone('listing-1', 'user-1')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.createMegafone('listing-1', 'user-1')).rejects.toThrow(
        'Este anúncio já possui um megafone ativo',
      );
    });

    it('should create free megafone for new listings (less than 7 days old)', async () => {
      mockPrisma.listing.findUnique.mockResolvedValue(newListing);
      mockPrisma.promotion.findFirst.mockResolvedValue(null);
      const createdPromo = { id: 'promo-1', type: 'MEGAFONE', pricePaidBrl: new Decimal('0.00') };
      mockPrisma.promotion.create.mockResolvedValue(createdPromo);
      mockPrisma.listing.update.mockResolvedValue({});

      const result = await service.createMegafone('listing-1', 'user-1');

      expect(result).toEqual(createdPromo);
      expect(mockPrisma.promotion.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'MEGAFONE',
            pricePaidBrl: new Decimal('0.00'),
            requiresDiscount: false,
          }),
        }),
      );
    });
  });

  describe('createBump', () => {
    const activeListing = {
      id: 'listing-1',
      sellerId: 'user-1',
      status: 'ACTIVE',
      title: 'Calça Jeans',
    };

    it('should throw BadRequestException if insufficient balance', async () => {
      mockPrisma.listing.findUnique.mockResolvedValue(activeListing);
      mockPrisma.promotion.findFirst.mockResolvedValue(null);
      mockPrisma.wallet.findUnique.mockResolvedValue({ id: 'wallet-1', userId: 'user-1', balanceBrl: new Decimal('2.00') });

      await expect(service.createBump('listing-1', 'user-1')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.createBump('listing-1', 'user-1')).rejects.toThrow(
        'Saldo insuficiente. Necessário R$5.00',
      );
    });

    it('should throw BadRequestException if wallet not found', async () => {
      mockPrisma.listing.findUnique.mockResolvedValue(activeListing);
      mockPrisma.promotion.findFirst.mockResolvedValue(null);
      mockPrisma.wallet.findUnique.mockResolvedValue(null);

      await expect(service.createBump('listing-1', 'user-1')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.createBump('listing-1', 'user-1')).rejects.toThrow(
        'Carteira não encontrada. Adicione saldo primeiro',
      );
    });

    it('should deduct from wallet and create bump promotion', async () => {
      mockPrisma.listing.findUnique.mockResolvedValue(activeListing);
      mockPrisma.promotion.findFirst.mockResolvedValue(null);
      mockPrisma.wallet.findUnique.mockResolvedValue({ id: 'wallet-1', userId: 'user-1', balanceBrl: new Decimal('50.00') });

      const createdPromo = { id: 'promo-1', type: 'BUMP', pricePaidBrl: new Decimal('5.00') };
      const mockTx = {
        wallet: { update: jest.fn().mockResolvedValue({}) },
        walletTransaction: { create: jest.fn().mockResolvedValue({}) },
        promotion: { create: jest.fn().mockResolvedValue(createdPromo) },
        listing: { update: jest.fn().mockResolvedValue({}) },
      };
      mockPrisma.$transaction.mockImplementation((cb: any) => cb(mockTx));

      const result = await service.createBump('listing-1', 'user-1');

      expect(result).toEqual(createdPromo);
      expect(mockTx.wallet.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { balanceBrl: { decrement: 5.0 } },
        }),
      );
    });
  });

  describe('createSpotlight', () => {
    it('should throw BadRequestException if already has active spotlight', async () => {
      mockPrisma.promotion.findFirst.mockResolvedValue({ id: 'promo-1', type: 'SPOTLIGHT' });

      await expect(service.createSpotlight('user-1')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.createSpotlight('user-1')).rejects.toThrow(
        'Você já possui um destaque ativo',
      );
    });

    it('should throw BadRequestException if insufficient balance', async () => {
      mockPrisma.promotion.findFirst.mockResolvedValue(null);
      mockPrisma.wallet.findUnique.mockResolvedValue({ id: 'wallet-1', balanceBrl: new Decimal('5.00') });

      await expect(service.createSpotlight('user-1')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.createSpotlight('user-1')).rejects.toThrow(
        'Saldo insuficiente. Necessário R$15.00',
      );
    });

    it('should create spotlight and promote all active listings', async () => {
      mockPrisma.promotion.findFirst.mockResolvedValue(null);
      mockPrisma.wallet.findUnique.mockResolvedValue({ id: 'wallet-1', balanceBrl: new Decimal('50.00') });

      const createdPromo = { id: 'promo-1', type: 'SPOTLIGHT', pricePaidBrl: new Decimal('15.00') };
      const mockTx = {
        wallet: { update: jest.fn().mockResolvedValue({}) },
        walletTransaction: { create: jest.fn().mockResolvedValue({}) },
        listing: { updateMany: jest.fn().mockResolvedValue({}) },
        promotion: { create: jest.fn().mockResolvedValue(createdPromo) },
      };
      mockPrisma.$transaction.mockImplementation((cb: any) => cb(mockTx));

      const result = await service.createSpotlight('user-1');

      expect(result).toEqual(createdPromo);
      expect(mockTx.listing.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { sellerId: 'user-1', status: 'ACTIVE' },
        }),
      );
    });
  });

  describe('getActivePromotions', () => {
    it('should return active promotions for user', async () => {
      const promotions = [
        { id: 'promo-1', type: 'BUMP', endsAt: new Date(Date.now() + 86400000) },
      ];
      mockPrisma.promotion.findMany.mockResolvedValue(promotions);

      const result = await service.getActivePromotions('user-1');

      expect(result).toEqual(promotions);
      expect(mockPrisma.promotion.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'user-1',
            endsAt: { gt: expect.any(Date) },
          }),
        }),
      );
    });
  });

  describe('getPromotionStats', () => {
    it('should throw NotFoundException if promotion not found', async () => {
      mockPrisma.promotion.findUnique.mockResolvedValue(null);

      await expect(service.getPromotionStats('nonexistent', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.getPromotionStats('nonexistent', 'user-1')).rejects.toThrow(
        'Promoção não encontrada',
      );
    });

    it('should throw ForbiddenException if user is not the owner', async () => {
      mockPrisma.promotion.findUnique.mockResolvedValue({
        id: 'promo-1',
        userId: 'user-1',
        listing: null,
      });

      await expect(service.getPromotionStats('promo-1', 'other-user')).rejects.toThrow(
        ForbiddenException,
      );
      await expect(service.getPromotionStats('promo-1', 'other-user')).rejects.toThrow(
        'Você não tem acesso a esta promoção',
      );
    });

    it('should return real stats for listing-specific promotion', async () => {
      mockPrisma.promotion.findUnique.mockResolvedValue({
        id: 'promo-1',
        userId: 'user-1',
        type: 'BUMP',
        listingId: 'listing-1',
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 86400000),
        listing: { id: 'listing-1', viewCount: 42 },
      });
      mockPrisma.favorite.count.mockResolvedValue(7);

      const result = await service.getPromotionStats('promo-1', 'user-1');

      expect(result.promotionId).toBe('promo-1');
      expect(result.type).toBe('BUMP');
      expect(result.views).toBe(42);
      expect(result.clicks).toBe(0);
      expect(result.favorites).toBe(7);
      expect(mockPrisma.favorite.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            listingId: 'listing-1',
          }),
        }),
      );
    });

    it('should return aggregated stats for spotlight promotion (no listing)', async () => {
      mockPrisma.promotion.findUnique.mockResolvedValue({
        id: 'promo-2',
        userId: 'user-1',
        type: 'SPOTLIGHT',
        listingId: null,
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 86400000),
        listing: null,
      });
      mockPrisma.listing.aggregate.mockResolvedValue({
        _sum: { viewCount: 150 },
      });
      mockPrisma.favorite.count.mockResolvedValue(12);

      const result = await service.getPromotionStats('promo-2', 'user-1');

      expect(result.promotionId).toBe('promo-2');
      expect(result.type).toBe('SPOTLIGHT');
      expect(result.views).toBe(150);
      expect(result.clicks).toBe(0);
      expect(result.favorites).toBe(12);
      expect(mockPrisma.listing.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { sellerId: 'user-1', status: 'ACTIVE' },
          _sum: { viewCount: true },
        }),
      );
    });

    it('should return 0 views when aggregate sum is null', async () => {
      mockPrisma.promotion.findUnique.mockResolvedValue({
        id: 'promo-3',
        userId: 'user-1',
        type: 'SPOTLIGHT',
        listingId: null,
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 86400000),
        listing: null,
      });
      mockPrisma.listing.aggregate.mockResolvedValue({
        _sum: { viewCount: null },
      });
      mockPrisma.favorite.count.mockResolvedValue(0);

      const result = await service.getPromotionStats('promo-3', 'user-1');

      expect(result.views).toBe(0);
      expect(result.favorites).toBe(0);
      expect(result.clicks).toBe(0);
    });
  });
});
