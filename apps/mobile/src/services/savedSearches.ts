import { apiFetch } from './api';

export interface SavedSearch {
  id: string;
  userId: string;
  query: string;
  filtersJson: Record<string, unknown>;
  notify: boolean;
  createdAt: string;
}

export async function listSavedSearches(): Promise<{ items: SavedSearch[] }> {
  return apiFetch<{ items: SavedSearch[] }>('/saved-searches');
}

export async function createSavedSearch(
  query: string,
  filters?: Record<string, unknown>,
  notify: boolean = true,
): Promise<SavedSearch> {
  return apiFetch<SavedSearch>('/saved-searches', {
    method: 'POST',
    body: JSON.stringify({ query, filters, notify }),
  });
}

export async function updateSavedSearch(
  id: string,
  notify: boolean,
): Promise<SavedSearch> {
  return apiFetch<SavedSearch>(`/saved-searches/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ notify }),
  });
}

export async function deleteSavedSearch(id: string): Promise<void> {
  await apiFetch<{ deleted: boolean }>(`/saved-searches/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}
