import { apiFetch } from './api';

export interface Offer {
  id: string;
  listingId: string;
  listingTitle: string;
  listingImageUrl?: string;
  amountBrl: number;
  status: 'pending' | 'accepted' | 'rejected' | 'expired';
  buyer: { id: string; name: string; avatarUrl?: string };
  seller: { id: string; name: string; avatarUrl?: string };
  createdAt: string;
  expiresAt: string;
}

export interface OffersResponse {
  items: Offer[];
  total: number;
  page: number;
  totalPages: number;
}

export async function makeOffer(
  listingId: string,
  amountBrl: number,
): Promise<Offer> {
  return apiFetch<Offer>('/offers', {
    method: 'POST',
    body: JSON.stringify({ listingId, amountBrl }),
  });
}

export async function getOffers(
  type: 'received' | 'sent',
  page?: number,
): Promise<OffersResponse> {
  const params = new URLSearchParams({ type });
  if (page) params.append('page', String(page));
  return apiFetch<OffersResponse>(`/offers?${params.toString()}`);
}

export async function acceptOffer(id: string): Promise<Offer> {
  return apiFetch<Offer>(`/offers/${encodeURIComponent(id)}/accept`, {
    method: 'PATCH',
  });
}

export async function rejectOffer(id: string): Promise<Offer> {
  return apiFetch<Offer>(`/offers/${encodeURIComponent(id)}/reject`, {
    method: 'PATCH',
  });
}
