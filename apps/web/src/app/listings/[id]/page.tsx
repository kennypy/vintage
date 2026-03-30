'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiGet, apiPost } from '@/lib/api';

interface ListingData {
  id: string;
  title: string;
  priceBrl?: number;
  price?: number;
  condition: string;
  size: string;
  brand?: { name: string } | string;
  color: string;
  description: string;
  seller?: {
    id: string;
    name: string;
    avatarUrl?: string;
    ratingAvg?: number;
    ratingCount?: number;
  };
  sellerName?: string;
  sellerRating?: number;
  sellerReviews?: number;
  shippingEstimate?: string;
  images?: Array<{ url: string } | string>;
}

function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function getImageUrl(img: { url: string } | string): string {
  return typeof img === 'string' ? img : img.url;
}

function getPrice(listing: ListingData): number {
  return listing.priceBrl ?? listing.price ?? 0;
}

function getSellerName(listing: ListingData): string {
  if (listing.seller?.name) return listing.seller.name;
  return listing.sellerName ?? '';
}

function getSellerId(listing: ListingData): string {
  return listing.seller?.id ?? '';
}

function getBrandName(listing: ListingData): string {
  if (!listing.brand) return '';
  if (typeof listing.brand === 'string') return listing.brand;
  return listing.brand.name;
}

// ── Lightbox ──────────────────────────────────────────────────────────────────
function Lightbox({ images, index, onClose }: { images: string[]; index: number; onClose: () => void }) {
  const [current, setCurrent] = useState(index);

  const prev = useCallback(() => setCurrent((i) => (i - 1 + images.length) % images.length), [images.length]);
  const next = useCallback(() => setCurrent((i) => (i + 1) % images.length), [images.length]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, prev, next]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
      onClick={onClose}
    >
      {/* Close */}
      <button
        className="absolute top-4 right-4 text-white/80 hover:text-white"
        onClick={onClose}
        aria-label="Fechar"
      >
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* Prev */}
      {images.length > 1 && (
        <button
          className="absolute left-4 text-white/80 hover:text-white"
          onClick={(e) => { e.stopPropagation(); prev(); }}
          aria-label="Anterior"
        >
          <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      )}

      {/* Image */}
      <img
        src={images[current]}
        alt={`Foto ${current + 1}`}
        className="max-h-[90vh] max-w-[90vw] object-contain rounded-lg"
        onClick={(e) => e.stopPropagation()}
      />

      {/* Next */}
      {images.length > 1 && (
        <button
          className="absolute right-4 text-white/80 hover:text-white"
          onClick={(e) => { e.stopPropagation(); next(); }}
          aria-label="Proxima"
        >
          <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}

      {/* Counter */}
      {images.length > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/60 text-sm">
          {current + 1} / {images.length}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ListingDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [listing, setListing] = useState<ListingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [activeImage, setActiveImage] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [contactingLoading, setContactingLoading] = useState(false);

  useEffect(() => {
    apiGet<ListingData>(`/listings/${encodeURIComponent(params.id)}`)
      .then((data) => {
        setListing(data);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [params.id]);

  const handleContactSeller = async () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('vintage_token') : null;
    if (!token) {
      router.push('/auth/login');
      return;
    }
    if (!listing) return;

    const sellerId = getSellerId(listing);
    if (!sellerId) return;

    setContactingLoading(true);
    try {
      const conv = await apiPost<{ id: string }>('/messages/conversations', {
        otherUserId: sellerId,
      });
      router.push(`/messages/${conv.id}`);
    } catch (err) {
      // If conversation already exists, the API may return it — redirect anyway
      if (err instanceof Error && err.message.includes('409')) {
        router.push('/messages');
      } else {
        alert('Erro ao iniciar conversa. Tente novamente.');
      }
    } finally {
      setContactingLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-32 mb-6" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
            <div className="aspect-[4/5] bg-gray-200 rounded-xl" />
            <div className="space-y-4">
              <div className="h-8 bg-gray-200 rounded w-3/4" />
              <div className="h-10 bg-gray-200 rounded w-1/3" />
              <div className="grid grid-cols-2 gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-12 bg-gray-200 rounded" />
                ))}
              </div>
              <div className="h-24 bg-gray-200 rounded" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (notFound || !listing) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Anuncio nao encontrado</h1>
        <p className="text-gray-500 mb-6">O anuncio que voce procura nao existe ou foi removido.</p>
        <Link
          href="/listings"
          className="inline-block px-6 py-3 bg-brand-600 text-white rounded-xl font-medium hover:bg-brand-700 transition"
        >
          Explorar anuncios
        </Link>
      </div>
    );
  }

  const imageUrls: string[] = (listing.images ?? []).map(getImageUrl);
  const hasImages = imageUrls.length > 0;

  const NoImagePlaceholder = () => (
    <div className="w-full h-full flex items-center justify-center text-gray-300">
      <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    </div>
  );

  const sellerName = getSellerName(listing);
  const sellerId = getSellerId(listing);
  const brandName = getBrandName(listing);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {lightboxOpen && hasImages && (
        <Lightbox
          images={imageUrls}
          index={activeImage}
          onClose={() => setLightboxOpen(false)}
        />
      )}

      <div className="mb-6">
        <Link href="/listings" className="text-sm text-brand-600 hover:text-brand-700 transition">
          &larr; Voltar para resultados
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
        {/* Image gallery */}
        <div className="space-y-3">
          {/* Main image */}
          <div
            className={`aspect-[4/5] bg-gray-100 rounded-xl overflow-hidden ${hasImages ? 'cursor-zoom-in' : ''}`}
            onClick={() => hasImages && setLightboxOpen(true)}
          >
            {hasImages ? (
              <img
                src={imageUrls[activeImage]}
                alt={listing.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <NoImagePlaceholder />
            )}
          </div>

          {/* Thumbnail strip */}
          {imageUrls.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {imageUrls.map((url, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setActiveImage(i)}
                  className={`flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition ${
                    activeImage === i ? 'border-brand-600' : 'border-transparent hover:border-gray-300'
                  }`}
                  aria-label={`Foto ${i + 1}`}
                >
                  <img src={url} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}

          {hasImages && (
            <p className="text-xs text-gray-400 text-center">Clique na foto para ampliar</p>
          )}
        </div>

        {/* Listing info */}
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">{listing.title}</h1>
            <p className="text-3xl font-bold text-brand-600">{formatBRL(getPrice(listing))}</p>
          </div>

          {/* Details */}
          <div className="grid grid-cols-2 gap-4">
            {listing.condition && (
              <div>
                <p className="text-xs text-gray-500 mb-1">Condicao</p>
                <p className="text-sm font-medium text-gray-900">{listing.condition}</p>
              </div>
            )}
            {listing.size && (
              <div>
                <p className="text-xs text-gray-500 mb-1">Tamanho</p>
                <p className="text-sm font-medium text-gray-900">{listing.size}</p>
              </div>
            )}
            {brandName && (
              <div>
                <p className="text-xs text-gray-500 mb-1">Marca</p>
                <p className="text-sm font-medium text-gray-900">{brandName}</p>
              </div>
            )}
            {listing.color && (
              <div>
                <p className="text-xs text-gray-500 mb-1">Cor</p>
                <p className="text-sm font-medium text-gray-900">{listing.color}</p>
              </div>
            )}
          </div>

          {/* Description */}
          {listing.description && (
            <div>
              <h2 className="text-sm font-semibold text-gray-900 mb-2">Descricao</h2>
              <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{listing.description}</p>
            </div>
          )}

          {/* Action buttons */}
          <div className="space-y-3">
            <button className="w-full py-3 bg-brand-600 text-white rounded-xl font-medium hover:bg-brand-700 transition text-lg">
              Comprar agora
            </button>
            <button className="w-full py-3 border-2 border-brand-600 text-brand-600 rounded-xl font-medium hover:bg-brand-50 transition">
              Fazer oferta
            </button>
            {sellerId && (
              <button
                type="button"
                onClick={handleContactSeller}
                disabled={contactingLoading}
                className="w-full py-3 border border-gray-300 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                {contactingLoading ? 'Abrindo conversa...' : 'Contatar vendedor'}
              </button>
            )}
          </div>

          {/* Shipping */}
          <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl">
            <svg className="w-5 h-5 text-gray-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
            <div>
              <p className="text-sm font-medium text-gray-900">Envio estimado</p>
              <p className="text-xs text-gray-500">{listing.shippingEstimate ?? '5-8 dias uteis'} via Correios ou Jadlog</p>
            </div>
          </div>

          {/* Buyer protection */}
          <div className="flex items-center gap-3 p-4 bg-green-50 rounded-xl">
            <svg className="w-5 h-5 text-green-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <div>
              <p className="text-sm font-medium text-gray-900">Protecao ao comprador</p>
              <p className="text-xs text-gray-500">Reembolso garantido se o item nao corresponder ao anuncio</p>
            </div>
          </div>

          {/* Seller card */}
          {sellerName && (
            <div className="p-4 border border-gray-200 rounded-xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-brand-100 rounded-full flex items-center justify-center text-brand-600 font-semibold text-sm overflow-hidden flex-shrink-0">
                  {listing.seller?.avatarUrl ? (
                    <img src={listing.seller.avatarUrl} alt={sellerName} className="w-full h-full object-cover" />
                  ) : (
                    sellerName.charAt(0).toUpperCase()
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{sellerName}</p>
                  {(listing.seller?.ratingAvg ?? listing.sellerRating) != null && (
                    <div className="flex items-center gap-1">
                      <svg className="w-3.5 h-3.5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                      <span className="text-xs text-gray-600">
                        {listing.seller?.ratingAvg ?? listing.sellerRating}
                        {' '}
                        ({listing.seller?.ratingCount ?? listing.sellerReviews} avaliacoes)
                      </span>
                    </div>
                  )}
                </div>
                {sellerId && (
                  <Link
                    href={`/seller/${sellerId}`}
                    className="text-xs text-brand-600 hover:text-brand-700 flex-shrink-0"
                  >
                    Ver perfil
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
