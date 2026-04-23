'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiGet, apiPost } from '@/lib/api';
import { MEGAFONE_FREE_DAYS } from '@vintage/shared';
import { formatBRL } from '@/lib/i18n';

interface Listing {
  id: string;
  title: string;
  priceBrl?: number;
  price?: number;
  status: string;
  images?: Array<{ url: string } | string>;
  activeUntil?: string;
}

interface ActivePromotion {
  id: string;
  type: string;
  endsAt: string;
  listingId?: string | null;
}

const BENEFITS = [
  'Visibilidade 10x maior',
  'Aparece primeiro nas buscas',
  'Notificação para compradores interessados',
  '1 uso grátis por mês',
];

const STEPS = [
  'Escolha um anuncio para impulsionar',
  'Seu anuncio aparece no topo das buscas por 24h',
  'Receba mais visitas e venda mais rapido',
];

export default function MegaphonePage() {
  const router = useRouter();
  const [showPicker, setShowPicker] = useState(false);
  const [listings, setListings] = useState<Listing[]>([]);
  const [loadingListings, setLoadingListings] = useState(false);
  const [boosting, setBoosting] = useState(false);
  const [confirmListing, setConfirmListing] = useState<Listing | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Load-time failures stay inside the picker sheet so the user doesn't
  // also see a duplicate banner at the top of the page.
  const [pickerError, setPickerError] = useState<string | null>(null);

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('vintage_token') : null;
    if (!token) {
      router.push('/auth/login');
    }
  }, [router]);

  const openPicker = async () => {
    setShowPicker(true);
    setLoadingListings(true);
    setErrorMessage(null);
    setPickerError(null);
    try {
      const user = await apiGet<{ id: string }>('/users/me');
      // Fetch listings and active promotions in parallel so the modal can
      // flag listings that already have a megafone rather than letting
      // the user re-tap and hit an API 400.
      const [res, promotions] = await Promise.all([
        apiGet<Listing[] | { data?: Listing[]; items?: Listing[] }>(
          `/users/${encodeURIComponent(user.id)}/listings`,
        ),
        apiGet<ActivePromotion[]>('/promotions').catch(() => [] as ActivePromotion[]),
      ]);
      const all = Array.isArray(res)
        ? res
        : ((res as { items?: Listing[] }).items ?? (res as { data?: Listing[] }).data ?? []);
      const megafoneByListing = new Map<string, string>();
      for (const promo of promotions) {
        if (promo.type === 'MEGAFONE' && promo.listingId) {
          megafoneByListing.set(promo.listingId, promo.endsAt);
        }
      }
      const mapped = all
        .filter((l) => l.status === 'ACTIVE')
        .map((l) => ({ ...l, activeUntil: megafoneByListing.get(l.id) }));
      mapped.sort((a, b) => {
        if (!!a.activeUntil === !!b.activeUntil) return 0;
        return a.activeUntil ? -1 : 1;
      });
      setListings(mapped);
    } catch {
      setPickerError('Não foi possível carregar seus anúncios.');
      setListings([]);
    } finally {
      setLoadingListings(false);
    }
  };

  const formatUntil = (iso: string) =>
    new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });

  const handleConfirm = async () => {
    if (!confirmListing) return;
    setBoosting(true);
    setErrorMessage(null);
    try {
      const promo = await apiPost<{ endsAt: string }>('/promotions/megafone', {
        listingId: confirmListing.id,
      });
      const activatedId = confirmListing.id;
      const activatedTitle = confirmListing.title;
      const endsAt = promo?.endsAt ?? new Date(Date.now() + MEGAFONE_FREE_DAYS * 864e5).toISOString();
      setListings((prev) => {
        const next = prev.map((l) => (l.id === activatedId ? { ...l, activeUntil: endsAt } : l));
        next.sort((a, b) => {
          if (!!a.activeUntil === !!b.activeUntil) return 0;
          return a.activeUntil ? -1 : 1;
        });
        return next;
      });
      setConfirmListing(null);
      setShowPicker(false);
      setSuccessMessage(
        `"${activatedTitle}" sera destacado para mais compradores por ${MEGAFONE_FREE_DAYS} dias.`,
      );
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Nao foi possivel ativar o megafone. Tente novamente.';
      setErrorMessage(message);
      setConfirmListing(null);
    } finally {
      setBoosting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Hero */}
      <div className="text-center mb-8">
        <div className="mx-auto w-20 h-20 rounded-full bg-brand-50 flex items-center justify-center mb-4">
          <svg className="w-10 h-10 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Megafone</h1>
        <span className="inline-block mt-2 px-3 py-1 bg-green-500 text-white text-xs font-bold rounded-full">
          Gratis
        </span>
        <p className="text-gray-500 mt-3">
          Destaque seu anuncio para mais compradores e venda mais rapido!
        </p>
      </div>

      {/* Success message */}
      {successMessage && (
        <div className="mb-6 bg-green-50 border border-green-200 rounded-xl p-4">
          <p className="text-green-800 font-medium">Megafone ativado!</p>
          <p className="text-green-700 text-sm mt-1">{successMessage}</p>
        </div>
      )}

      {/* Error message */}
      {errorMessage && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-red-800 text-sm">{errorMessage}</p>
        </div>
      )}

      {/* How it works */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Como funciona</h2>
        <ol className="space-y-3">
          {STEPS.map((text, i) => (
            <li key={i} className="flex items-center gap-3">
              <span className="w-7 h-7 rounded-full bg-brand-500 text-white text-sm font-bold flex items-center justify-center flex-shrink-0">
                {i + 1}
              </span>
              <span className="text-sm text-gray-700">{text}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* Benefits */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Beneficios</h2>
        <ul className="space-y-3">
          {BENEFITS.map((b) => (
            <li key={b} className="flex items-center gap-3">
              <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
              <span className="text-sm text-gray-700">{b}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* CTA */}
      <button
        type="button"
        onClick={openPicker}
        className="w-full py-3 bg-brand-600 text-white rounded-xl font-medium hover:bg-brand-700 transition"
      >
        Usar meu Megafone gratis
      </button>

      {/* Listing picker modal */}
      {showPicker && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-lg max-h-[70vh] overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Escolha um anuncio</h3>
              <button
                type="button"
                onClick={() => { setShowPicker(false); setConfirmListing(null); }}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="overflow-y-auto max-h-[50vh] p-4">
              {loadingListings ? (
                <div className="text-center py-8">
                  <div className="animate-spin inline-block w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full" />
                  <p className="text-sm text-gray-500 mt-2">Carregando...</p>
                </div>
              ) : pickerError ? (
                <div className="text-center py-8 space-y-3">
                  <p className="text-sm text-red-600">{pickerError}</p>
                  <button
                    type="button"
                    onClick={openPicker}
                    className="text-sm font-medium text-brand-600 hover:text-brand-700"
                  >
                    Tentar novamente
                  </button>
                </div>
              ) : listings.length === 0 ? (
                <p className="text-center text-gray-500 py-8 text-sm">
                  Você não tem anúncios ativos. Publique um anúncio primeiro.
                </p>
              ) : (
                <div className="space-y-2">
                  {listings.map((item) => {
                    const isActive = !!item.activeUntil;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => !isActive && setConfirmListing(item)}
                        disabled={boosting || isActive}
                        className={`w-full text-left p-3 rounded-xl border transition flex items-start justify-between gap-3 ${
                          isActive
                            ? 'border-green-200 bg-green-50 cursor-not-allowed'
                            : confirmListing?.id === item.id
                              ? 'border-brand-500 bg-brand-50'
                              : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-900 truncate">{item.title}</p>
                          <p className="text-sm text-brand-600 font-semibold mt-0.5">
                            {formatBRL(item.priceBrl ?? item.price ?? 0)}
                          </p>
                          {isActive && item.activeUntil && (
                            <p className="text-xs font-semibold text-green-700 mt-1 flex items-center gap-1">
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                              </svg>
                              Megafone ativo até {formatUntil(item.activeUntil)}
                            </p>
                          )}
                        </div>
                        {isActive && (
                          <span className="text-xs font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-full shrink-0">
                            Ativado
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            {confirmListing && (
              <div className="p-4 border-t border-gray-200 bg-gray-50">
                <p className="text-sm text-gray-700 mb-3">
                  Ativar megafone gratuito para <strong>&quot;{confirmListing.title}&quot;</strong>?
                  <br />
                  Seu anuncio sera destacado por {MEGAFONE_FREE_DAYS} dias.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmListing(null)}
                    className="flex-1 py-2 border border-gray-300 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-100 transition"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirm}
                    disabled={boosting}
                    className="flex-1 py-2 bg-brand-600 text-white rounded-xl text-sm font-medium hover:bg-brand-700 transition disabled:opacity-50"
                  >
                    {boosting ? 'Ativando...' : 'Confirmar'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
