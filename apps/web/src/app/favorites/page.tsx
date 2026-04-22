'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import ListingCard from '@/components/ListingCard';
import { useApiQuery, unwrapList } from '@/lib/useApiQuery';

interface Listing {
  id: string;
  title: string;
  priceBrl?: number;
  price?: number;
  size: string;
  condition: string;
  seller?: { name: string };
  sellerName?: string;
  images?: Array<{ url: string } | string>;
}

function getImageUrl(img: { url: string } | string): string {
  return typeof img === 'string' ? img : img.url;
}

export default function FavoritesPage() {
  const { data: fetched, loading, error } = useApiQuery<Listing[]>('/listings/favorites', {
    requireAuth: true,
    transform: unwrapList<Listing>,
  });
  // Local copy so the unfavorite toggle can remove items without refetching.
  const [listings, setListings] = useState<Listing[]>([]);
  const [favoritedIds, setFavoritedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (fetched) {
      setListings(fetched);
      setFavoritedIds(new Set(fetched.map((l) => l.id)));
    }
  }, [fetched]);

  const handleToggleFavorite = (id: string, favorited: boolean) => {
    setFavoritedIds((prev) => {
      const next = new Set(prev);
      if (favorited) {
        next.add(id);
      } else {
        next.delete(id);
        setListings((curr) => curr.filter((l) => l.id !== id));
      }
      return next;
    });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Favoritos</h1>

      {error && <div className="text-center py-8 text-red-500">{error}</div>}

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="aspect-[4/5] bg-gray-200 rounded-xl mb-2" />
              <div className="h-4 bg-gray-200 rounded w-20 mb-1" />
              <div className="h-3 bg-gray-200 rounded w-32" />
            </div>
          ))}
        </div>
      ) : listings.length === 0 ? (
        <div className="text-center py-16">
          <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
          <p className="text-gray-500 mb-4">Você ainda não tem favoritos.</p>
          <Link href="/listings" className="inline-block px-6 py-2 bg-brand-600 text-white rounded-xl text-sm font-medium hover:bg-brand-700 transition">
            Explorar peças
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {listings.map((l) => (
            <ListingCard
              key={l.id}
              id={l.id}
              title={l.title}
              price={l.priceBrl ?? l.price ?? 0}
              size={l.size}
              condition={l.condition}
              sellerName={l.seller?.name ?? l.sellerName ?? ''}
              imageUrl={l.images?.[0] ? getImageUrl(l.images[0]) : undefined}
              favorited={favoritedIds.has(l.id)}
              onToggleFavorite={handleToggleFavorite}
            />
          ))}
        </div>
      )}
    </div>
  );
}
