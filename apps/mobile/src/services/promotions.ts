import { apiFetch } from './api';

interface Promotion {
  id: string;
  type: string;
  startsAt: string;
  endsAt: string;
  pricePaidBrl: number;
  listingId?: string;
}

export async function createBump(listingId: string): Promise<Promotion> {
  return apiFetch<Promotion>('/promotions/bump', {
    method: 'POST',
    body: JSON.stringify({ listingId }),
    headers: { 'Content-Type': 'application/json' },
    authenticated: true,
  });
}

export async function createSpotlight(): Promise<Promotion> {
  return apiFetch<Promotion>('/promotions/spotlight', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    authenticated: true,
  });
}

export async function createMegafone(listingId: string): Promise<Promotion> {
  return apiFetch<Promotion>('/promotions/megafone', {
    method: 'POST',
    body: JSON.stringify({ listingId }),
    headers: { 'Content-Type': 'application/json' },
    authenticated: true,
  });
}

export async function getActivePromotions(): Promise<Promotion[]> {
  return apiFetch<Promotion[]>('/promotions', { authenticated: true });
}
