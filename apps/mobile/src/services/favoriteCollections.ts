import { apiFetch } from './api';

export interface FavoriteCollection {
  id: string;
  userId: string;
  name: string;
  isDefault: boolean;
  createdAt: string;
  _count?: { favorites: number };
}

export async function listCollections(): Promise<FavoriteCollection[]> {
  return apiFetch<FavoriteCollection[]>('/favorite-collections');
}

export async function createCollection(name: string): Promise<FavoriteCollection> {
  return apiFetch<FavoriteCollection>('/favorite-collections', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export async function renameCollection(id: string, name: string): Promise<FavoriteCollection> {
  return apiFetch<FavoriteCollection>(`/favorite-collections/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });
}

export async function removeCollection(id: string): Promise<void> {
  await apiFetch(`/favorite-collections/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function getCollectionItems(
  id: string,
  page = 1,
): Promise<{
  collection: FavoriteCollection;
  items: Array<{ listing: { id: string; title: string; priceBrl: number; images?: { url: string }[] } }>;
  total: number;
  hasMore: boolean;
}> {
  const params = new URLSearchParams({ page: String(page) });
  return apiFetch(`/favorite-collections/${encodeURIComponent(id)}/items?${params.toString()}`);
}

export async function moveFavorite(listingId: string, collectionId: string | null): Promise<void> {
  await apiFetch('/favorite-collections/move', {
    method: 'POST',
    body: JSON.stringify({ listingId, collectionId }),
  });
}
