import { apiFetch } from './api';

export interface PriceAlert {
  id: string;
  listingId: string;
  title: string;
  status: string;
  imageUrl: string | null;
  originalPriceBrl: number;
  currentPriceBrl: number;
  dropped: boolean;
  dropPct: number;
  notifiedAt: string | null;
  createdAt: string;
}

export async function listPriceAlerts(): Promise<{ items: PriceAlert[] }> {
  return apiFetch<{ items: PriceAlert[] }>('/price-alerts');
}

export async function deletePriceAlert(id: string): Promise<void> {
  await apiFetch<{ deleted: boolean }>(`/price-alerts/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}
