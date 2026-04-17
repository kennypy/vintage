import type { Metadata } from 'next';
import SellerProfileClient from './SellerProfileClient';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://vintage.br';

interface SellerMetadata {
  id: string;
  name: string;
  avatarUrl?: string;
  bio?: string;
  ratingAvg?: number;
  ratingCount?: number;
  listingCount?: number;
}

async function fetchSeller(id: string): Promise<SellerMetadata | null> {
  try {
    const res = await fetch(
      `${API_URL}/users/${encodeURIComponent(id)}`,
      { next: { revalidate: 60 } },
    );
    if (!res.ok) return null;
    return (await res.json()) as SellerMetadata;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const seller = await fetchSeller(id);

  if (!seller) {
    return {
      title: 'Vendedor nao encontrado',
    };
  }

  const description = seller.bio
    ? seller.bio.slice(0, 155)
    : `Veja os anuncios de ${seller.name} na Vintage.br`;

  const url = `${APP_URL}/seller/${seller.id}`;

  return {
    title: seller.name,
    description,
    openGraph: {
      type: 'profile',
      url,
      title: `${seller.name} — Vintage.br`,
      description,
      ...(seller.avatarUrl && {
        images: [
          {
            url: seller.avatarUrl,
            alt: seller.name,
          },
        ],
      }),
    },
    twitter: {
      card: seller.avatarUrl ? 'summary_large_image' : 'summary',
      title: `${seller.name} — Vintage.br`,
      description,
      ...(seller.avatarUrl && {
        images: [seller.avatarUrl],
      }),
    },
  };
}

export default async function SellerProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SellerProfileClient id={id} />;
}
