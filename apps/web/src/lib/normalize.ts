export interface ApiListingItem {
  id: string;
  title: string;
  priceBrl?: number;
  price?: number;
  size?: string;
  condition?: string;
  seller?: { name: string };
  sellerName?: string;
  images?: Array<{ url: string } | string>;
  imageUrl?: string;
}

export interface ListingItem {
  id: string;
  title: string;
  price: number;
  size: string;
  condition: string;
  sellerName: string;
  imageUrl?: string;
}

export function normalizeItem(raw: ApiListingItem): ListingItem {
  let imageUrl: string | undefined;
  if (raw.imageUrl) {
    imageUrl = raw.imageUrl;
  } else if (raw.images && raw.images.length > 0) {
    const first = raw.images[0];
    imageUrl = typeof first === 'string' ? first : first.url;
  }
  return {
    id: raw.id,
    title: raw.title,
    price: raw.priceBrl ?? raw.price ?? 0,
    size: raw.size ?? '',
    condition: raw.condition ?? '',
    sellerName: raw.seller?.name ?? raw.sellerName ?? '',
    imageUrl,
  };
}
