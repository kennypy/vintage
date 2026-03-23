import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MeiliSearch } from 'meilisearch';

interface SearchFilters {
  categoryId?: string;
  brandId?: string;
  condition?: string;
  size?: string;
  color?: string;
  minPrice?: number;
  maxPrice?: number;
}

@Injectable()
export class SearchService implements OnModuleInit {
  private readonly logger = new Logger(SearchService.name);
  private client: MeiliSearch;
  private readonly indexName = 'listings';

  constructor(private configService: ConfigService) {
    this.client = new MeiliSearch({
      host: this.configService.get<string>('MEILISEARCH_HOST', 'http://localhost:7700'),
      apiKey: this.configService.get<string>('MEILISEARCH_API_KEY', ''),
    });
  }

  async onModuleInit() {
    try {
      const index = this.client.index(this.indexName);

      await index.updateSearchableAttributes([
        'title',
        'description',
        'category',
        'brand',
        'color',
        'size',
      ]);

      await index.updateFilterableAttributes([
        'categoryId',
        'brandId',
        'condition',
        'size',
        'color',
        'priceBrl',
        'status',
      ]);

      await index.updateSortableAttributes([
        'priceBrl',
        'createdAt',
        'viewCount',
      ]);

      this.logger.log('Meilisearch index "listings" configurado com sucesso');
    } catch (error) {
      this.logger.error('Erro ao configurar índice Meilisearch', error);
    }
  }

  async indexListing(listing: Record<string, any>) {
    const index = this.client.index(this.indexName);
    await index.addDocuments([listing]);
  }

  async removeListing(listingId: string) {
    const index = this.client.index(this.indexName);
    await index.deleteDocument(listingId);
  }

  async search(
    query: string,
    filters: SearchFilters,
    sort: string,
    page: number,
    pageSize: number,
  ) {
    const index = this.client.index(this.indexName);

    const filterParts: string[] = [];

    if (filters.categoryId) {
      filterParts.push(`categoryId = "${filters.categoryId}"`);
    }
    if (filters.brandId) {
      filterParts.push(`brandId = "${filters.brandId}"`);
    }
    if (filters.condition) {
      filterParts.push(`condition = "${filters.condition}"`);
    }
    if (filters.size) {
      filterParts.push(`size = "${filters.size}"`);
    }
    if (filters.color) {
      filterParts.push(`color = "${filters.color}"`);
    }
    if (filters.minPrice !== undefined) {
      filterParts.push(`priceBrl >= ${filters.minPrice}`);
    }
    if (filters.maxPrice !== undefined) {
      filterParts.push(`priceBrl <= ${filters.maxPrice}`);
    }

    const filterString = filterParts.length > 0
      ? filterParts.join(' AND ')
      : undefined;

    let sortOption: string[] | undefined;
    switch (sort) {
      case 'newest':
        sortOption = ['createdAt:desc'];
        break;
      case 'oldest':
        sortOption = ['createdAt:asc'];
        break;
      case 'price_asc':
        sortOption = ['priceBrl:asc'];
        break;
      case 'price_desc':
        sortOption = ['priceBrl:desc'];
        break;
      case 'popular':
        sortOption = ['viewCount:desc'];
        break;
      default:
        sortOption = ['createdAt:desc'];
    }

    const offset = (page - 1) * pageSize;

    const result = await index.search(query || '', {
      filter: filterString,
      sort: sortOption,
      offset,
      limit: pageSize,
    });

    return {
      hits: result.hits,
      total: result.estimatedTotalHits ?? 0,
      page,
      pageSize,
      hasMore: offset + result.hits.length < (result.estimatedTotalHits ?? 0),
    };
  }
}
