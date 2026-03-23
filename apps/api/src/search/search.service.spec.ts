import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SearchService } from './search.service';

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

    it('should build filter string from filters', async () => {
      mockIndex.search.mockResolvedValue({ hits: [], estimatedTotalHits: 0 });

      await service.search('', { categoryId: 'cat-1', minPrice: 50, maxPrice: 200 }, 'newest', 1, 20);

      expect(mockIndex.search).toHaveBeenCalledWith('', expect.objectContaining({
        filter: 'categoryId = "cat-1" AND priceBrl >= 50 AND priceBrl <= 200',
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
