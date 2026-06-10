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

// Whitelist of clothing-condition + size tokens accepted from the filter
// query. Defense in depth on top of the API DTO validation: prevents a
// malformed token reaching the Meilisearch filter expression even if a
// future controller forgets to apply the DTO transform.
const ALLOWED_CONDITIONS = new Set(['NEW', 'LIKE_NEW', 'GOOD', 'FAIR', 'POOR']);
const ALLOWED_SIZES = new Set([
  'PP', 'P', 'M', 'G', 'GG', 'XG', 'XGG',
  '34', '36', '38', '40', '42', '44', '46', '48',
  'UNICO', 'INFANTIL',
]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CUID_RE = /^c[a-z0-9]{24,}$/i;
// Free-text filter values (color) — alnum + hyphen + space + Portuguese
// accented vowels, capped at 32 chars. Anything else is rejected so
// Meilisearch's filter parser never sees a quote / backslash / control char.
const SAFE_TEXT_RE = /^[\p{L}\p{N} \-_]{1,32}$/u;

@Injectable()
export class SearchService implements OnModuleInit {
  private readonly logger = new Logger(SearchService.name);
  private client: MeiliSearch;
  private readonly indexName = 'listings';
  private readonly apiKey: string;

  constructor(private configService: ConfigService) {
    const nodeEnv = this.configService.get<string>('NODE_ENV', 'development');
    const configuredHost = this.configService.get<string>('MEILISEARCH_HOST', '');
    // Only fall back to localhost in non-production. Production must set this.
    const host = configuredHost || (nodeEnv !== 'production' ? 'http://localhost:7700' : '');
    if (!host) {
      this.logger.warn('MEILISEARCH_HOST is not configured — search is disabled');
    }
    this.apiKey = this.configService.get<string>('MEILISEARCH_API_KEY', '');
    this.client = new MeiliSearch({
      host: host || 'http://127.0.0.1:7700', // placeholder; calls will fail fast
      apiKey: this.apiKey,
    });
  }

  /**
   * Stringifies an error for logging while redacting the Meilisearch API
   * key. The Meilisearch SDK occasionally embeds the bearer token in
   * underlying fetch error messages (e.g. on connection-reset). Without
   * this, a noisy log aggregator would mirror our search-admin key into
   * its searchable index — exactly the kind of "secret in logs" leak
   * CLAUDE.md §Logging forbids.
   */
  private redactApiKey(input: unknown): string {
    let s = input instanceof Error ? `${input.name}: ${input.message}` : String(input);
    if (this.apiKey && s.includes(this.apiKey)) {
      s = s.split(this.apiKey).join('[REDACTED:MEILI_KEY]');
    }
    // Bearer tokens in any header dump.
    s = s.replace(/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer [REDACTED]');
    return s.slice(0, 500);
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
      this.logger.error(`Erro ao configurar índice Meilisearch: ${this.redactApiKey(error)}`);
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
    page = Math.max(1, Number(page) || 1);
    pageSize = Math.min(100, Math.max(1, Number(pageSize) || 20));
    const index = this.client.index(this.indexName);

    const filterParts: string[] = [];
    // Every value spliced into the filter string is validated against a
    // strict shape (UUID/CUID for ids, enum for condition, alnum for size,
    // safe text for color). Meilisearch's filter parser doesn't have a
    // SQL-injection-style escape vulnerability, but rejecting malformed
    // tokens upfront stops the parser from emitting obscure errors AND
    // keeps user-controlled bytes out of the operator-defined query DSL.

    if (filters.categoryId && (UUID_RE.test(filters.categoryId) || CUID_RE.test(filters.categoryId))) {
      filterParts.push(`categoryId = "${filters.categoryId}"`);
    }
    if (filters.brandId && (UUID_RE.test(filters.brandId) || CUID_RE.test(filters.brandId))) {
      filterParts.push(`brandId = "${filters.brandId}"`);
    }
    if (filters.condition && ALLOWED_CONDITIONS.has(filters.condition)) {
      filterParts.push(`condition = "${filters.condition}"`);
    }
    if (filters.size && ALLOWED_SIZES.has(filters.size.toUpperCase())) {
      filterParts.push(`size = "${filters.size.toUpperCase()}"`);
    }
    if (filters.color && SAFE_TEXT_RE.test(filters.color)) {
      filterParts.push(`color = "${filters.color}"`);
    }
    if (filters.minPrice !== undefined && Number.isFinite(filters.minPrice) && filters.minPrice >= 0) {
      filterParts.push(`priceBrl >= ${Number(filters.minPrice)}`);
    }
    if (filters.maxPrice !== undefined && Number.isFinite(filters.maxPrice) && filters.maxPrice >= 0) {
      filterParts.push(`priceBrl <= ${Number(filters.maxPrice)}`);
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
