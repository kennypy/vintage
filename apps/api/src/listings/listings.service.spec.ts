import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ListingsService } from './listings.service';
import { PrismaService } from '../prisma/prisma.service';
import { SearchService } from '../search/search.service';

jest.mock('@vintage/shared', () => ({
  MAX_LISTING_IMAGES: 20,
  containsProhibitedContent: jest.fn().mockReturnValue({ matched: false }),
}));

const mockPrisma = {
  user: { findUnique: jest.fn() },
  category: { findUnique: jest.fn(), findMany: jest.fn() },
  brand: { findUnique: jest.fn(), findMany: jest.fn() },
  listing: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  listingImage: { deleteMany: jest.fn() },
  favorite: {
    findUnique: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
  },
  order: { aggregate: jest.fn() },
  savedSearch: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  follow: { findMany: jest.fn() },
};

describe('ListingsService', () => {
  let service: ListingsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ListingsService,
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((k) =>
              k === 'ALLOWED_IMAGE_HOSTS' ? 'img.example.com' : undefined,
            ),
          },
        },
        {
          provide: SearchService,
          useValue: {
            indexListing: jest.fn().mockResolvedValue(undefined),
            removeListing: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<ListingsService>(ListingsService);
  });

  describe('create', () => {
    const createDto = {
      title: 'Vestido Zara',
      description: 'Vestido midi em ótimo estado',
      categoryId: 'cat-1',
      condition: 'GOOD',
      priceBrl: 89.9,
      shippingWeightG: 400,
      imageUrls: ['https://img.example.com/1.jpg', 'https://img.example.com/2.jpg'],
    } as any;

    it('should create listing with images', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ vacationMode: false });
      mockPrisma.category.findUnique.mockResolvedValue({ id: 'cat-1' });
      const createdListing = { id: 'listing-1', ...createDto };
      mockPrisma.listing.create.mockResolvedValue(createdListing);

      const result = await service.create('seller-1', createDto);

      expect(mockPrisma.listing.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            sellerId: 'seller-1',
            title: 'Vestido Zara',
            images: {
              create: [
                { url: 'https://img.example.com/1.jpg', position: 0, width: 0, height: 0 },
                { url: 'https://img.example.com/2.jpg', position: 1, width: 0, height: 0 },
              ],
            },
          }),
        }),
      );
      expect(result).toEqual(createdListing);
    });

    it('should reject if user is on vacation mode', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ vacationMode: true });

      await expect(service.create('seller-1', createDto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.create('seller-1', createDto)).rejects.toThrow(
        'Desative o modo férias antes de criar anúncios',
      );
    });

    it('should reject if more than 20 images', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ vacationMode: false });
      const tooManyImages = Array.from({ length: 21 }, (_, i) => `https://img.example.com/${i}.jpg`);

      await expect(
        service.create('seller-1', { ...createDto, imageUrls: tooManyImages }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject if no images provided', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ vacationMode: false });

      await expect(
        service.create('seller-1', { ...createDto, imageUrls: [] }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject if category is invalid', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ vacationMode: false });
      mockPrisma.category.findUnique.mockResolvedValue(null);

      await expect(service.create('seller-1', createDto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.create('seller-1', createDto)).rejects.toThrow(
        'Categoria inválida',
      );
    });
  });

  describe('findOne', () => {
    it('should return listing and increment views', async () => {
      const listing = {
        id: 'listing-1',
        status: 'ACTIVE',
        title: 'Vestido',
        seller: { id: 'seller-1' },
      };
      mockPrisma.listing.findUnique.mockResolvedValue(listing);
      mockPrisma.listing.update.mockResolvedValue(listing);

      const result = await service.findOne('listing-1');

      expect(result).toEqual(listing);
      expect(mockPrisma.listing.update).toHaveBeenCalledWith({
        where: { id: 'listing-1' },
        data: { viewCount: { increment: 1 } },
      });
    });

    it('should throw NotFoundException for non-existent listing', async () => {
      mockPrisma.listing.findUnique.mockResolvedValue(null);

      await expect(service.findOne('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException for deleted listing', async () => {
      mockPrisma.listing.findUnique.mockResolvedValue({
        id: 'listing-1',
        status: 'DELETED',
      });

      await expect(service.findOne('listing-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('search', () => {
    it('should filter by category, condition, and price range', async () => {
      const searchDto = {
        categoryId: 'cat-1',
        condition: 'NEW',
        minPrice: 50,
        maxPrice: 200,
        page: 1,
        pageSize: 20,
      };

      const items = [{ id: 'listing-1' }];
      mockPrisma.listing.findMany.mockResolvedValue(items);
      mockPrisma.listing.count.mockResolvedValue(1);

      const result = await service.search(searchDto);

      expect(mockPrisma.listing.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'ACTIVE',
            categoryId: 'cat-1',
            condition: 'NEW',
            priceBrl: { gte: 50, lte: 200 },
          }),
        }),
      );
      expect(result).toEqual({
        items,
        total: 1,
        page: 1,
        pageSize: 20,
        hasMore: false,
      });
    });

    it('should search by text query', async () => {
      mockPrisma.listing.findMany.mockResolvedValue([]);
      mockPrisma.listing.count.mockResolvedValue(0);

      await service.search({ q: 'vestido' });

      expect(mockPrisma.listing.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { title: { contains: 'vestido', mode: 'insensitive' } },
              { description: { contains: 'vestido', mode: 'insensitive' } },
            ],
          }),
        }),
      );
    });

    it('should sort by price ascending', async () => {
      mockPrisma.listing.findMany.mockResolvedValue([]);
      mockPrisma.listing.count.mockResolvedValue(0);

      await service.search({ sort: 'price_asc' as any });

      expect(mockPrisma.listing.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { priceBrl: 'asc' },
        }),
      );
    });
  });

  describe('update', () => {
    it('should allow owner to update their listing', async () => {
      mockPrisma.listing.findUnique.mockResolvedValue({
        id: 'listing-1',
        sellerId: 'seller-1',
        status: 'ACTIVE',
      });
      const updated = { id: 'listing-1', title: 'Updated Title' };
      mockPrisma.listing.update.mockResolvedValue(updated);

      const result = await service.update('listing-1', 'seller-1', {
        title: 'Updated Title',
      });

      expect(result).toEqual(updated);
    });

    it('should reject if not the owner', async () => {
      mockPrisma.listing.findUnique.mockResolvedValue({
        id: 'listing-1',
        sellerId: 'seller-1',
        status: 'ACTIVE',
      });

      await expect(
        service.update('listing-1', 'other-user', { title: 'Hacked' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject if listing is sold', async () => {
      mockPrisma.listing.findUnique.mockResolvedValue({
        id: 'listing-1',
        sellerId: 'seller-1',
        status: 'SOLD',
      });

      await expect(
        service.update('listing-1', 'seller-1', { title: 'Updated' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject if listing not found', async () => {
      mockPrisma.listing.findUnique.mockResolvedValue(null);

      await expect(
        service.update('nonexistent', 'seller-1', { title: 'Updated' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('toggleFavorite', () => {
    it('should add favorite if not already favorited', async () => {
      mockPrisma.listing.findUnique.mockResolvedValue({
        id: 'listing-1',
        status: 'ACTIVE',
      });
      mockPrisma.favorite.findUnique.mockResolvedValue(null);
      mockPrisma.favorite.create.mockResolvedValue({});
      mockPrisma.listing.update.mockResolvedValue({});

      const result = await service.toggleFavorite('listing-1', 'user-1');

      expect(result).toEqual({ favorited: true });
      expect(mockPrisma.favorite.create).toHaveBeenCalledWith({
        data: { userId: 'user-1', listingId: 'listing-1' },
      });
    });

    it('should remove favorite if already favorited', async () => {
      mockPrisma.listing.findUnique.mockResolvedValue({
        id: 'listing-1',
        status: 'ACTIVE',
      });
      mockPrisma.favorite.findUnique.mockResolvedValue({
        userId: 'user-1',
        listingId: 'listing-1',
      });
      mockPrisma.favorite.delete.mockResolvedValue({});
      mockPrisma.listing.update.mockResolvedValue({});

      const result = await service.toggleFavorite('listing-1', 'user-1');

      expect(result).toEqual({ favorited: false });
      expect(mockPrisma.favorite.delete).toHaveBeenCalled();
    });

    it('should throw NotFoundException for inactive listing', async () => {
      mockPrisma.listing.findUnique.mockResolvedValue({
        id: 'listing-1',
        status: 'SOLD',
      });

      await expect(
        service.toggleFavorite('listing-1', 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getPriceSuggestion', () => {
    it('should return price data from completed orders', async () => {
      mockPrisma.category.findUnique.mockResolvedValue({ id: 'cat-1' });
      mockPrisma.order.aggregate.mockResolvedValue({
        _avg: { itemPriceBrl: 120.5 },
        _min: { itemPriceBrl: 50.0 },
        _max: { itemPriceBrl: 250.0 },
        _count: 15,
      });

      const result = await service.getPriceSuggestion('cat-1', 'brand-1', 'GOOD');

      expect(result).toEqual({
        suggestedPriceBrl: 120.5,
        minPriceBrl: 50.0,
        maxPriceBrl: 250.0,
        basedOnCount: 15,
      });
    });

    it('should fallback to category-only data when no exact matches', async () => {
      mockPrisma.category.findUnique.mockResolvedValue({ id: 'cat-1' });
      mockPrisma.order.aggregate
        .mockResolvedValueOnce({ _count: 0, _avg: { itemPriceBrl: null }, _min: { itemPriceBrl: null }, _max: { itemPriceBrl: null } })
        .mockResolvedValueOnce({
          _avg: { itemPriceBrl: 100.0 },
          _min: { itemPriceBrl: 30.0 },
          _max: { itemPriceBrl: 200.0 },
          _count: 10,
        });

      const result = await service.getPriceSuggestion('cat-1', 'brand-1', 'NEW');

      expect(result).toEqual({
        suggestedPriceBrl: 100.0,
        minPriceBrl: 30.0,
        maxPriceBrl: 200.0,
        basedOnCount: 10,
      });
    });

    it('should throw NotFoundException when no data available', async () => {
      mockPrisma.category.findUnique.mockResolvedValue({ id: 'cat-1' });
      mockPrisma.order.aggregate.mockResolvedValue({
        _count: 0,
        _avg: { itemPriceBrl: null },
        _min: { itemPriceBrl: null },
        _max: { itemPriceBrl: null },
      });

      await expect(
        service.getPriceSuggestion('cat-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for invalid category', async () => {
      mockPrisma.category.findUnique.mockResolvedValue(null);

      await expect(
        service.getPriceSuggestion('invalid-cat'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // Sync contract: only ACTIVE listings live in Meilisearch. All other
  // status values — PAUSED, SOLD, DELETED, SUSPENDED — must be evicted
  // so buyers never see them in search results.
  describe('syncSearchIndex', () => {
    const activeListing = {
      id: 'listing-1',
      title: 'Vestido Zara',
      description: 'midi',
      sellerId: 'seller-1',
      categoryId: 'cat-1',
      brandId: 'brand-1',
      condition: 'GOOD',
      size: 'M',
      color: 'azul',
      priceBrl: { toString: () => '120.00', valueOf: () => 120 },
      status: 'ACTIVE',
      viewCount: 5,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      images: [{ url: 'https://img.example.com/1.jpg' }],
      category: { namePt: 'Vestidos', slug: 'vestidos' },
      brand: { name: 'Zara' },
    };

    it('indexes the document when listing is ACTIVE', async () => {
      mockPrisma.listing.findUnique.mockResolvedValue(activeListing);
      const searchMock = (service as any).searchService;

      await service.syncSearchIndex('listing-1');

      expect(searchMock.indexListing).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'listing-1',
          title: 'Vestido Zara',
          status: 'ACTIVE',
          priceBrl: 120,
          brand: 'Zara',
          category: 'Vestidos',
          imageUrl: 'https://img.example.com/1.jpg',
        }),
      );
      expect(searchMock.removeListing).not.toHaveBeenCalled();
    });

    it.each(['PAUSED', 'SOLD', 'DELETED', 'SUSPENDED'])(
      'removes from index when status is %s',
      async (status) => {
        mockPrisma.listing.findUnique.mockResolvedValue({
          ...activeListing,
          status,
        });
        const searchMock = (service as any).searchService;

        await service.syncSearchIndex('listing-1');

        expect(searchMock.removeListing).toHaveBeenCalledWith('listing-1');
        expect(searchMock.indexListing).not.toHaveBeenCalled();
      },
    );

    it('removes from index when listing does not exist (hard-delete path)', async () => {
      mockPrisma.listing.findUnique.mockResolvedValue(null);
      const searchMock = (service as any).searchService;

      await service.syncSearchIndex('listing-1');

      expect(searchMock.removeListing).toHaveBeenCalledWith('listing-1');
    });

    it('swallows search errors so a broken index never breaks DB writes', async () => {
      mockPrisma.listing.findUnique.mockResolvedValue(activeListing);
      const searchMock = (service as any).searchService;
      searchMock.indexListing.mockRejectedValueOnce(new Error('meili down'));

      await expect(service.syncSearchIndex('listing-1')).resolves.not.toThrow();
    });
  });
});
