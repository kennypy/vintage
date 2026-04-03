'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { apiGet, apiPost, apiDelete } from '@/lib/api';
import ListingCard from '@/components/ListingCard';

interface SellerProfile {
  id: string;
  name: string;
  avatarUrl?: string;
  bio?: string;
  ratingAvg?: number;
  ratingCount?: number;
  listingCount?: number;
  followerCount?: number;
  followingCount?: number;
  isFollowing?: boolean;
  createdAt?: string;
}

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

export default function SellerProfilePage({ params }: { params: { id: string } }) {
  const [seller, setSeller] = useState<SellerProfile | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [following, setFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);

  useEffect(() => {
    Promise.all([
      apiGet<SellerProfile>(`/users/${encodeURIComponent(params.id)}`).catch(() => null),
      apiGet<Listing[] | { data: Listing[]; items: Listing[] }>(`/users/${encodeURIComponent(params.id)}/listings`).catch(() => []),
    ]).then(([profile, listingRes]) => {
      if (profile) {
        setSeller(profile);
        setFollowing(profile.isFollowing ?? false);
      }
      const list = Array.isArray(listingRes) ? listingRes : ((listingRes as { items?: Listing[] }).items ?? (listingRes as { data?: Listing[] }).data ?? []);
      setListings(list);
    }).finally(() => setLoading(false));
  }, [params.id]);

  const handleFollow = async () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('vintage_token') : null;
    if (!token) return;

    setFollowLoading(true);
    try {
      if (following) {
        await apiDelete(`/users/${encodeURIComponent(params.id)}/follow`);
        setFollowing(false);
        if (seller) setSeller({ ...seller, followerCount: Math.max(0, (seller.followerCount ?? 1) - 1) });
      } else {
        await apiPost(`/users/${encodeURIComponent(params.id)}/follow`);
        setFollowing(true);
        if (seller) setSeller({ ...seller, followerCount: (seller.followerCount ?? 0) + 1 });
      }
    } catch {
      // silently fail
    } finally {
      setFollowLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-6">
          <div className="flex gap-6">
            <div className="w-24 h-24 bg-gray-200 rounded-full" />
            <div className="flex-1 space-y-3">
              <div className="h-6 bg-gray-200 rounded w-48" />
              <div className="h-4 bg-gray-200 rounded w-32" />
              <div className="h-4 bg-gray-200 rounded w-64" />
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => <div key={i} className="aspect-[4/5] bg-gray-200 rounded-xl" />)}
          </div>
        </div>
      </div>
    );
  }

  if (!seller) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Vendedor nao encontrado</h1>
        <Link href="/listings" className="inline-block px-6 py-3 bg-brand-600 text-white rounded-xl font-medium hover:bg-brand-700 transition">
          Explorar anuncios
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Profile header */}
      <div className="flex flex-col sm:flex-row gap-6 mb-8">
        <div className="w-24 h-24 bg-brand-100 rounded-full flex items-center justify-center text-brand-600 font-bold text-3xl flex-shrink-0 overflow-hidden">
          {seller.avatarUrl ? (
            <img src={seller.avatarUrl} alt={seller.name} className="w-full h-full object-cover" />
          ) : (
            seller.name.charAt(0).toUpperCase()
          )}
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{seller.name}</h1>
          {seller.ratingAvg != null && (
            <div className="flex items-center gap-1 mt-1">
              <svg className="w-4 h-4 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              <span className="text-sm text-gray-600">
                {seller.ratingAvg} ({seller.ratingCount} avaliacoes)
              </span>
              <Link
                href={`/reviews?userId=${encodeURIComponent(seller.id)}&name=${encodeURIComponent(seller.name)}`}
                className="text-xs text-brand-600 hover:text-brand-700 ml-2"
              >
                Ver avaliacoes
              </Link>
            </div>
          )}
          {seller.bio && <p className="text-sm text-gray-600 mt-2">{seller.bio}</p>}

          <div className="flex gap-6 mt-3">
            <div className="text-center">
              <p className="text-lg font-bold text-gray-900">{seller.listingCount ?? listings.length}</p>
              <p className="text-xs text-gray-500">anuncios</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-gray-900">{seller.followerCount ?? 0}</p>
              <p className="text-xs text-gray-500">seguidores</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-gray-900">{seller.followingCount ?? 0}</p>
              <p className="text-xs text-gray-500">seguindo</p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleFollow}
            disabled={followLoading}
            className={`mt-4 px-6 py-2 rounded-xl text-sm font-medium transition disabled:opacity-50 ${
              following
                ? 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                : 'bg-brand-600 text-white hover:bg-brand-700'
            }`}
          >
            {following ? 'Seguindo' : 'Seguir'}
          </button>
        </div>
      </div>

      {/* Listings */}
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Anuncios de {seller.name}</h2>
      {listings.length === 0 ? (
        <p className="text-center py-8 text-gray-500">Nenhum anuncio ativo.</p>
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
              sellerName={l.seller?.name ?? l.sellerName ?? seller.name}
              imageUrl={l.images?.[0] ? getImageUrl(l.images[0]) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}
