import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SearchService } from './search.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  listing: {
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
  },
};

const mockIndex = {
  search: jest.fn(),
  addDocuments: jest.fn(),
  deleteDocument: jest.fn(),
  updateSearchableAttributes: jest.fn(),
  updateFilterableAttributes: jest.fn(),
  updateSortableAttributes: jest.fn(),
};

jest.mock('meilisearch', () => ({
  MeiliSearch: jest.fn().mockImplementation(() => ({
    index: jest.fn().mockReturnValue(mockIndex),
  })),
}));

const mockConfigService = {
  get: jest.fn((key: string, defaultValue?: string) => {
    const config: Record<string, string> = {
      MEILISEARCH_HOST: 'http://localhost:7700',
      MEILISEARCH_API_KEY: 'test-key',
    };
    return config[key] ?? defaultValue;
  }),
};

describe('SearchService', () => {
  let service: SearchService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<SearchService>(SearchService);
  });

  describe('search', () => {
    it('should search with query and pagination', async () => {
      mockIndex.search.mockResolvedValue({
        hits: [{ id: 'listing-1', title: 'Camisa' }],
        estimatedTotalHits: 1,
      });

      const result = await service.search('camisa', {}, 'newest', 1, 20);

      expect(result.hits).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);
      expect(result.hasMore).toBe(false);
      expect(mockIndex.search).toHaveBeenCalledWith('camisa', expect.objectContaining({
        offset: 0,
        limit: 20,
      }));
    });

    it('falls back to Postgres (no 500) when Meilisearch is down', async () => {
      mockIndex.search.mockRejectedValue(new Error('ECONNREFUSED meili'));
      mockPrisma.listing.findMany.mockResolvedValueOnce([
        {
          id: 'l1',
          title: 'Camisa',
          description: 'linda camisa',
          sellerId: 's1',
          categoryId: 'c1',
          brandId: null,
          category: { namePt: 'Roupas' },
          brand: null,
          condition: 'GOOD',
          size: 'M',
          color: 'azul',
          priceBrl: 50,
          status: 'ACTIVE',
          viewCount: 3,
          images: [{ url: 'http://img/1.jpg' }],
          createdAt: new Date(0),
        },
      ]);
      mockPrisma.listing.count.mockResolvedValueOnce(1);

      const result = await service.search('camisa', {}, 'newest', 1, 20);

      // Degraded but not a 500 — Postgres answered.
      expect(mockPrisma.listing.findMany).toHaveBeenCalled();
      expect(result.total).toBe(1);
      // Hit shape matches the indexed-document shape callers expect.
      expect(result.hits[0]).toMatchObject({
        id: 'l1',
        title: 'Camisa',
        imageUrl: 'http://img/1.jpg',
        priceBrl: 50,
        category: 'Roupas',
        createdAt: 0,
      });
    });

    it('should build filter string from filters', async () => {
      mockIndex.search.mockResolvedValue({ hits: [], estimatedTotalHits: 0 });

      // M3: categoryId/brandId values must be valid CUIDs (Prisma default)
      // or UUIDs to be spliced into the Meilisearch filter expression.
      // Anything else is silently dropped — defense in depth on top of
      // the controller's DTO validation.
      const validCuid = 'clxh7y8z00000abcdefghijkl';
      await service.search(
        '',
        { categoryId: validCuid, minPrice: 50, maxPrice: 200 },
        'newest',
        1,
        20,
      );

      expect(mockIndex.search).toHaveBeenCalledWith('', expect.objectContaining({
        filter: `categoryId = "${validCuid}" AND priceBrl >= 50 AND priceBrl <= 200`,
      }));
    });

    it('drops malformed categoryId values silently (M3 defense-in-depth)', async () => {
      mockIndex.search.mockResolvedValue({ hits: [], estimatedTotalHits: 0 });

      await service.search(
        '',
        { categoryId: '"; DROP TABLE listings; --', minPrice: 50 },
        'newest',
        1,
        20,
      );

      // Bad categoryId shouldn't reach the filter expression at all.
      expect(mockIndex.search).toHaveBeenCalledWith('', expect.objectContaining({
        filter: 'priceBrl >= 50',
      }));
    });

    it('should set sort option for price_asc', async () => {
      mockIndex.search.mockResolvedValue({ hits: [], estimatedTotalHits: 0 });

      await service.search('', {}, 'price_asc', 1, 20);

      expect(mockIndex.search).toHaveBeenCalledWith('', expect.objectContaining({
        sort: ['priceBrl:asc'],
      }));
    });

    it('should set sort option for price_desc', async () => {
      mockIndex.search.mockResolvedValue({ hits: [], estimatedTotalHits: 0 });

      await service.search('', {}, 'price_desc', 1, 20);

      expect(mockIndex.search).toHaveBeenCalledWith('', expect.objectContaining({
        sort: ['priceBrl:desc'],
      }));
    });

    it('should set sort option for popular', async () => {
      mockIndex.search.mockResolvedValue({ hits: [], estimatedTotalHits: 0 });

      await service.search('', {}, 'popular', 1, 20);

      expect(mockIndex.search).toHaveBeenCalledWith('', expect.objectContaining({
        sort: ['viewCount:desc'],
      }));
    });

    it('should calculate hasMore when more results available', async () => {
      mockIndex.search.mockResolvedValue({
        hits: Array.from({ length: 10 }, (_, i) => ({ id: `listing-${i}` })),
        estimatedTotalHits: 50,
      });

      const result = await service.search('', {}, 'newest', 1, 10);

      expect(result.hasMore).toBe(true);
    });

    it('should calculate correct offset for page 2', async () => {
      mockIndex.search.mockResolvedValue({ hits: [], estimatedTotalHits: 0 });

      await service.search('', {}, 'newest', 2, 20);

      expect(mockIndex.search).toHaveBeenCalledWith('', expect.objectContaining({
        offset: 20,
      }));
    });
  });

  describe('indexListing', () => {
    it('should add listing document to the index', async () => {
      mockIndex.addDocuments.mockResolvedValue({});

      await service.indexListing({ id: 'listing-1', title: 'Camisa' });

      expect(mockIndex.addDocuments).toHaveBeenCalledWith([
        { id: 'listing-1', title: 'Camisa' },
      ]);
    });
  });

  describe('removeListing', () => {
    it('should delete listing document from the index', async () => {
      mockIndex.deleteDocument.mockResolvedValue({});

      await service.removeListing('listing-1');

      expect(mockIndex.deleteDocument).toHaveBeenCalledWith('listing-1');
    });
  });
});
