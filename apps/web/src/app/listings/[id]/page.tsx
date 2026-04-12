import type { Metadata } from 'next';
import ListingDetailClient from './ListingDetailClient';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://vintage.br';

interface ListingMetadata {
  id: string;
  title: string;
  description: string;
  priceBrl?: number;
  price?: number;
  images?: Array<{ url: string } | string>;
}

function getImageUrl(img: { url: string } | string): string {
  return typeof img === 'string' ? img : img.url;
}

async function fetchListing(id: string): Promise<ListingMetadata | null> {
  try {
    const res = await fetch(
      `${API_URL}/listings/${encodeURIComponent(id)}`,
      { next: { revalidate: 60 } },
    );
    if (!res.ok) return null;
    return (await res.json()) as ListingMetadata;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const listing = await fetchListing(params.id);

  if (!listing) {
    return {
      title: 'Anuncio nao encontrado',
    };
  }

  const price = listing.priceBrl ?? listing.price ?? 0;
  const formattedPrice = price.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });

  const description = listing.description
    ? `${listing.description.slice(0, 155)}...`
    : `${listing.title} por ${formattedPrice} na Vintage.br`;

  const images: string[] = (listing.images ?? [])
    .map(getImageUrl)
    .filter(Boolean);

  const url = `${APP_URL}/listings/${listing.id}`;

  return {
    title: listing.title,
    description,
    openGraph: {
      type: 'website',
      url,
      title: `${listing.title} — ${formattedPrice}`,
      description,
      ...(images.length > 0 && {
        images: images.slice(0, 4).map((imgUrl) => ({
          url: imgUrl,
          alt: listing.title,
        })),
      }),
    },
    twitter: {
      card: images.length > 0 ? 'summary_large_image' : 'summary',
      title: `${listing.title} — ${formattedPrice}`,
      description,
      ...(images.length > 0 && {
        images: [images[0]],
      }),
    },
  };
}

export default function ListingDetailPage({
  params,
}: {
  params: { id: string };
}) {
  return <ListingDetailClient id={params.id} />;
}
