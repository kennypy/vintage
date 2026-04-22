'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { apiDelete, apiPatch } from '@/lib/api';
import { formatBRL, LISTING_STATUS_PT, LISTING_STATUS_COLORS } from '@/lib/i18n';
import { useApiQuery, unwrapList } from '@/lib/useApiQuery';

interface Listing {
  id: string;
  title: string;
  priceBrl?: number;
  price?: number;
  size: string;
  condition: string;
  status: string;
  viewCount?: number;
  favoriteCount?: number;
  images?: Array<{ url: string } | string>;
  createdAt: string;
}

function getImageUrl(img: { url: string } | string): string {
  return typeof img === 'string' ? img : img.url;
}

type StatusFilter = 'ALL' | 'ACTIVE' | 'PAUSED' | 'SOLD';

export default function MyListingsPage() {
  const [filter, setFilter] = useState<StatusFilter>('ALL');

  const { data: me, error: meError } = useApiQuery<{ id: string }>('/users/me', {
    requireAuth: true,
  });
  // Second query depends on the first — `enabled` blocks it until we
  // have the user id. useApiQuery returns loading=false when disabled so
  // the skeleton shows only when actually fetching.
  const listingsPath = me?.id ? `/users/${encodeURIComponent(me.id)}/listings` : null;
  const { data, loading, error: listError, refetch } = useApiQuery<Listing[]>(listingsPath, {
    requireAuth: true,
    enabled: !!me?.id,
    transform: unwrapList<Listing>,
  });
  const listings = data ?? [];
  const error = meError ?? listError;

  const filtered = filter === 'ALL' ? listings : listings.filter((l) => l.status === filter);

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este anúncio?')) return;
    try {
      await apiDelete(`/listings/${encodeURIComponent(id)}`);
      await refetch();
    } catch (err) {
      alert(err instanceof Error && err.message ? err.message : 'Erro ao excluir anúncio.');
    }
  };

  const handleTogglePause = async (listing: Listing) => {
    const newStatus = listing.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    try {
      await apiPatch(`/listings/${encodeURIComponent(listing.id)}`, { status: newStatus });
      await refetch();
    } catch (err) {
      alert(err instanceof Error && err.message ? err.message : 'Erro ao atualizar status.');
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Meus anúncios</h1>
        <Link href="/sell" className="px-4 py-2 bg-brand-600 text-white rounded-xl text-sm font-medium hover:bg-brand-700 transition">
          Novo anúncio
        </Link>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-xl border border-red-200 bg-red-50 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}

      {/* Status filter */}
      <div className="flex gap-2 mb-6 overflow-x-auto">
        {(['ALL', 'ACTIVE', 'PAUSED', 'SOLD'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition ${
              filter === s
                ? 'bg-brand-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {s === 'ALL' ? 'Todos' : LISTING_STATUS_PT[s] ?? s}
            {s === 'ALL' ? ` (${listings.length})` : ` (${listings.filter((l) => l.status === s).length})`}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="animate-pulse bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex gap-4">
                <div className="w-20 h-20 bg-gray-200 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-3/4" />
                  <div className="h-3 bg-gray-200 rounded w-1/2" />
                  <div className="h-3 bg-gray-200 rounded w-1/4" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-500 mb-4">
            {filter === 'ALL' ? 'Você ainda não criou nenhum anúncio.' : `Nenhum anúncio com status "${LISTING_STATUS_PT[filter]}".`}
          </p>
          <Link href="/sell" className="inline-block px-6 py-2 bg-brand-600 text-white rounded-xl text-sm font-medium hover:bg-brand-700 transition">
            Criar anúncio
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((listing) => {
            const imgUrl = listing.images?.[0] ? getImageUrl(listing.images[0]) : undefined;
            return (
              <div key={listing.id} className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="flex gap-4">
                  <Link href={`/listings/${listing.id}`} className="relative w-20 h-20 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                    {imgUrl ? (
                      <Image src={imgUrl} alt={listing.title} fill className="object-cover" sizes="80px" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-300">
                        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                    )}
                  </Link>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`/listings/${listing.id}`} className="text-sm font-medium text-gray-900 hover:text-brand-600 truncate">
                        {listing.title}
                      </Link>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${LISTING_STATUS_COLORS[listing.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {LISTING_STATUS_PT[listing.status] ?? listing.status}
                      </span>
                    </div>
                    <p className="text-lg font-bold text-brand-600 mt-0.5">{formatBRL(listing.priceBrl ?? listing.price ?? 0)}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                      <span>{listing.size}</span>
                      <span>{listing.condition}</span>
                      {listing.viewCount != null && <span>{listing.viewCount} visualizações</span>}
                      {listing.favoriteCount != null && <span>{listing.favoriteCount} favoritos</span>}
                    </div>
                  </div>
                </div>
                {listing.status !== 'SOLD' && (
                  <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
                    <button
                      type="button"
                      onClick={() => handleTogglePause(listing)}
                      className="px-3 py-1.5 text-xs font-medium border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition"
                    >
                      {listing.status === 'ACTIVE' ? 'Pausar' : 'Ativar'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(listing.id)}
                      className="px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition"
                    >
                      Excluir
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
