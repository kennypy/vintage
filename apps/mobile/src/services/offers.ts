import { apiFetch } from './api';

// Mirrors the Prisma enum OfferStatus in apps/api/prisma/schema.prisma —
// backend returns these as UPPERCASE strings.
export type OfferStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'COUNTERED'
  | 'EXPIRED';

export interface Offer {
  id: string;
  listingId: string;
  listingTitle: string;
  listingImageUrl?: string;
  amountBrl: number;
  status: OfferStatus;
  buyer: { id: string; name: string; avatarUrl?: string };
  seller: { id: string; name: string; avatarUrl?: string };
  createdAt: string;
  expiresAt: string;
  parentOfferId?: string | null;
  counterCount?: number;
  counteredById?: string | null;
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

export async function counterOffer(
  id: string,
  amountBrl: number,
): Promise<Offer> {
  return apiFetch<Offer>(`/offers/${encodeURIComponent(id)}/counter`, {
    method: 'POST',
    body: JSON.stringify({ amountBrl }),
  });
}

export async function getOfferThread(id: string): Promise<Offer[]> {
  return apiFetch<Offer[]>(`/offers/${encodeURIComponent(id)}/thread`);
}
