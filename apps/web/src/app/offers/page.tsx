'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { apiPatch } from '@/lib/api';
import { formatBRL, OFFER_STATUS_PT, OFFER_STATUS_COLORS } from '@/lib/i18n';
import { useApiQuery, unwrapList } from '@/lib/useApiQuery';

// Status mirrors the Prisma OfferStatus enum — API returns UPPERCASE.
type OfferStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'COUNTERED' | 'EXPIRED';

interface Offer {
  id: string;
  listingId: string;
  listingTitle: string;
  listingImageUrl?: string;
  amountBrl: number;
  status: OfferStatus;
  buyer: { id: string; name: string };
  seller: { id: string; name: string };
  createdAt: string;
  expiresAt: string;
  counterCount?: number;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function OffersPage() {
  const [tab, setTab] = useState<'received' | 'sent'>('received');
  const { data, loading, error, refetch } = useApiQuery<Offer[]>(
    `/offers?type=${tab}`,
    { requireAuth: true, transform: unwrapList<Offer> },
  );
  const offers = data ?? [];

  const handleAccept = async (id: string) => {
    try {
      await apiPatch(`/offers/${encodeURIComponent(id)}/accept`);
      await refetch();
    } catch (err) {
      alert(err instanceof Error && err.message ? err.message : 'Erro ao aceitar oferta.');
    }
  };

  const handleReject = async (id: string) => {
    try {
      await apiPatch(`/offers/${encodeURIComponent(id)}/reject`);
      await refetch();
    } catch (err) {
      alert(err instanceof Error && err.message ? err.message : 'Erro ao recusar oferta.');
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Ofertas</h1>

      {error && (
        <div className="mb-4 p-3 rounded-xl border border-red-200 bg-red-50 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <div className="flex gap-6">
          {(['received', 'sent'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`pb-3 text-sm font-medium border-b-2 transition ${
                tab === t
                  ? 'border-brand-600 text-brand-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t === 'received' ? 'Recebidas' : 'Enviadas'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="animate-pulse bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex gap-4">
                <div className="w-16 h-16 bg-gray-200 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-3/4" />
                  <div className="h-3 bg-gray-200 rounded w-1/2" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : offers.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-500 mb-4">
            {tab === 'received' ? 'Nenhuma oferta recebida.' : 'Nenhuma oferta enviada.'}
          </p>
          <Link href="/listings" className="inline-block px-6 py-2 bg-brand-600 text-white rounded-xl text-sm font-medium hover:bg-brand-700 transition">
            Explorar peças
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {offers.map((offer) => (
            <div key={offer.id} className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex gap-4">
                <Link href={`/listings/${offer.listingId}`} className="relative w-16 h-16 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                  {offer.listingImageUrl ? (
                    <Image src={offer.listingImageUrl} alt={offer.listingTitle} fill sizes="64px" className="object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-300">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                  )}
                </Link>
                <div className="flex-1 min-w-0">
                  <Link href={`/listings/${offer.listingId}`} className="text-sm font-medium text-gray-900 hover:text-brand-600 truncate block">
                    {offer.listingTitle}
                  </Link>
                  <p className="text-lg font-bold text-brand-600 mt-0.5">{formatBRL(offer.amountBrl)}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {tab === 'received' ? `De: ${offer.buyer.name}` : `Para: ${offer.seller.name}`} &middot; {formatDate(offer.createdAt)}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2 flex-shrink-0">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${OFFER_STATUS_COLORS[offer.status] ?? 'bg-gray-100 text-gray-600'}`}>
                    {OFFER_STATUS_PT[offer.status] ?? offer.status}
                  </span>
                  {tab === 'received' && offer.status === 'PENDING' && (
                    <div className="flex gap-2 mt-1">
                      <button
                        type="button"
                        onClick={() => handleAccept(offer.id)}
                        className="px-3 py-1 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 transition"
                      >
                        Aceitar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReject(offer.id)}
                        className="px-3 py-1 bg-red-100 text-red-600 rounded-lg text-xs font-medium hover:bg-red-200 transition"
                      >
                        Recusar
                      </button>
                    </div>
                  )}
                  <Link
                    href={`/offers/${offer.id}`}
                    className="mt-1 text-xs font-medium text-brand-600 hover:underline"
                  >
                    Ver negociação →
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
