import { apiFetch } from './api';

export interface BundleListing {
  id: string;
  title: string;
  priceBrl: number;
  images: Array<{ url: string }>;
}

export interface BundleItem {
  id: string;
  listingId: string;
  listing: BundleListing;
}

export interface Bundle {
  id: string;
  buyerId: string;
  sellerId: string;
  status: 'OPEN' | 'CHECKED_OUT' | 'EXPIRED';
  createdAt: string;
  items: BundleItem[];
}

export async function createBundle(sellerId: string, listingIds: string[]): Promise<Bundle> {
  return apiFetch<Bundle>('/bundles', {
    method: 'POST',
    body: JSON.stringify({ sellerId, listingIds }),
  });
}

export async function listMyBundles(): Promise<Bundle[]> {
  return apiFetch<Bundle[]>('/bundles');
}

export async function getBundle(id: string): Promise<Bundle> {
  return apiFetch<Bundle>(`/bundles/${encodeURIComponent(id)}`);
}

export async function removeBundleItem(bundleId: string, listingId: string): Promise<void> {
  await apiFetch<{ removed: boolean }>(
    `/bundles/${encodeURIComponent(bundleId)}/items/${encodeURIComponent(listingId)}`,
    { method: 'DELETE' },
  );
}

export async function checkoutBundle(
  bundleId: string,
  addressId: string,
  paymentMethod: string,
): Promise<{ orderIds: string[]; totalBrl: number }> {
  return apiFetch<{ orderIds: string[]; totalBrl: number }>(
    `/bundles/${encodeURIComponent(bundleId)}/checkout`,
    {
      method: 'POST',
      body: JSON.stringify({ addressId, paymentMethod }),
    },
  );
}
