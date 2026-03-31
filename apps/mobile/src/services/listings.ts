import { apiFetch } from './api';
import { isDemoModeSync, toggleDemoFavorite, getDemoFavorites } from './demoStore';

export interface ListingImage {
  id: string;
  url: string;
  order: number;
}

export interface ListingSeller {
  id: string;
  name: string;
  avatarUrl?: string;
  rating?: number;
}

export interface Listing {
  id: string;
  title: string;
  description: string;
  priceBrl: number;
  originalPriceBrl?: number;
  category: string;
  subcategory?: string;
  size: string;
  brand?: string;
  condition: string;
  color?: string;
  images: ListingImage[];
  seller: ListingSeller;
  isFavorited?: boolean;
  viewCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ListingsResponse {
  items: Listing[];
  total: number;
  page: number;
  totalPages: number;
}

export interface ListingParams {
  search?: string;
  category?: string;
  subcategory?: string;
  size?: string;
  brand?: string;
  condition?: string;
  color?: string;
  minPrice?: number;
  maxPrice?: number;
  sortBy?: 'price_asc' | 'price_desc' | 'newest' | 'relevance';
  page?: number;
  limit?: number;
}

export interface CreateListingData {
  title: string;
  description: string;
  priceBrl: number;
  originalPriceBrl?: number;
  category: string;
  subcategory?: string;
  size: string;
  brand?: string;
  condition: string;
  color?: string;
  imageIds: string[];
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  subcategories?: Category[];
}

export interface PriceSuggestionParams {
  category: string;
  brand?: string;
  condition: string;
  size?: string;
}

export interface PriceSuggestion {
  suggestedPriceBrl: number;
  minPriceBrl: number;
  maxPriceBrl: number;
}

export interface SavedSearch {
  id: string;
  query: string;
  filters: Record<string, string>;
  createdAt: string;
}

function buildQueryString(params: Record<string, unknown>): string {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.append(key, String(value));
    }
  }
  const qs = searchParams.toString();
  return qs ? `?${qs}` : '';
}

export async function getListings(params?: ListingParams): Promise<ListingsResponse> {
  const query = params ? buildQueryString(params as Record<string, unknown>) : '';
  return apiFetch<ListingsResponse>(`/listings${query}`, {
    authenticated: false,
  });
}

export async function getListing(id: string): Promise<Listing> {
  return apiFetch<Listing>(`/listings/${encodeURIComponent(id)}`, {
    authenticated: false,
  });
}

export async function createListing(data: CreateListingData): Promise<Listing> {
  return apiFetch<Listing>('/listings', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateListing(
  id: string,
  data: Partial<CreateListingData>,
): Promise<Listing> {
  return apiFetch<Listing>(`/listings/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteListing(id: string): Promise<void> {
  await apiFetch<void>(`/listings/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function toggleFavorite(id: string): Promise<{ favorited: boolean }> {
  if (isDemoModeSync()) {
    const favorited = toggleDemoFavorite(id);
    return { favorited };
  }
  try {
    return await apiFetch<{ favorited: boolean }>(
      `/listings/${encodeURIComponent(id)}/favorite`,
      { method: 'POST' },
    );
  } catch (_error) {
    const favorited = toggleDemoFavorite(id);
    return { favorited };
  }
}

export async function getFavorites(page?: number): Promise<ListingsResponse> {
  if (isDemoModeSync()) {
    const items = getDemoFavorites() as unknown as Listing[];
    return { items, total: items.length, page: 1, totalPages: 1 };
  }
  try {
    const query = page ? `?page=${page}` : '';
    return await apiFetch<ListingsResponse>(`/listings/favorites${query}`);
  } catch (_error) {
    const items = getDemoFavorites() as unknown as Listing[];
    return { items, total: items.length, page: 1, totalPages: 1 };
  }
}

export async function getCategories(): Promise<Category[]> {
  return apiFetch<Category[]>('/listings/categories', {
    authenticated: false,
  });
}

export async function getPriceSuggestion(
  params: PriceSuggestionParams,
): Promise<PriceSuggestion> {
  const query = buildQueryString(params as unknown as Record<string, unknown>);
  return apiFetch<PriceSuggestion>(`/listings/price-suggestion${query}`);
}

export async function getSavedSearches(): Promise<SavedSearch[]> {
  return apiFetch<SavedSearch[]>('/listings/saved-searches');
}

export async function saveSearch(
  query: string,
  filters: Record<string, string>,
): Promise<SavedSearch> {
  return apiFetch<SavedSearch>('/listings/saved-searches', {
    method: 'POST',
    body: JSON.stringify({ query, filters }),
  });
}

export async function deleteSavedSearch(id: string): Promise<void> {
  await apiFetch<void>(`/listings/saved-searches/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}
