'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiGet, apiPost } from '@/lib/api';
import { SPOTLIGHT_PRICE_BRL, SPOTLIGHT_DURATION_DAYS } from '@vintage/shared';

interface ActivePromotion {
  id: string;
  type: string;
  endsAt: string;
  listingId?: string | null;
}

const BENEFITS = [
  'Selo de loja em destaque no perfil',
  'Seus anúncios aparecem antes dos demais',
  'Notificações para seus seguidores sobre novos anúncios',
  'Estatísticas avançadas da sua loja',
  'Banner personalizado no seu perfil',
];

export default function HighlightPage() {
  const router = useRouter();
  const [activating, setActivating] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeUntil, setActiveUntil] = useState<string | null>(null);

  const priceFormatted = SPOTLIGHT_PRICE_BRL.toFixed(2).replace('.', ',');

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('vintage_token') : null;
    if (!token) {
      router.push('/auth/login');
      return;
    }
    // Spotlight is per-user (not per-listing), so gate the CTA on the
    // single active SPOTLIGHT promotion rather than letting a second
    // activation bounce off the API with a 400.
    apiGet<ActivePromotion[]>('/promotions')
      .then((promos) => {
        const spotlight = promos.find((p) => p.type === 'SPOTLIGHT');
        if (spotlight) setActiveUntil(spotlight.endsAt);
      })
      .catch(() => {});
  }, [router]);

  const formatUntil = (iso: string) =>
    new Date(iso).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });

  const handleConfirm = async () => {
    setActivating(true);
    setErrorMessage(null);
    try {
      const promo = await apiPost<{ endsAt: string }>('/promotions/spotlight');
      const endsAt = promo?.endsAt ?? new Date(Date.now() + SPOTLIGHT_DURATION_DAYS * 864e5).toISOString();
      setActiveUntil(endsAt);
      setShowConfirm(false);
      setSuccessMessage(
        `Seu perfil agora tem o selo de loja em destaque por ${SPOTLIGHT_DURATION_DAYS} dias. O valor de R$ ${priceFormatted} foi debitado da sua carteira.`,
      );
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Nao foi possivel ativar o destaque. Tente novamente.';
      setErrorMessage(message);
      setShowConfirm(false);
    } finally {
      setActivating(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Hero */}
      <div className="text-center mb-8">
        <div className="mx-auto w-20 h-20 rounded-full bg-yellow-50 flex items-center justify-center mb-4">
          <svg className="w-10 h-10 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Destaque da loja</h1>
        <p className="text-gray-500 mt-2">
          Torne seu perfil um destaque e atraia muito mais compradores para sua loja
        </p>
      </div>

      {/* Success message */}
      {successMessage && (
        <div className="mb-6 bg-green-50 border border-green-200 rounded-xl p-4">
          <p className="text-green-800 font-medium">Destaque ativado!</p>
          <p className="text-green-700 text-sm mt-1">{successMessage}</p>
          <button
            type="button"
            onClick={() => router.push('/profile')}
            className="inline-block mt-3 text-sm text-green-700 underline hover:text-green-900"
          >
            Ver meu perfil
          </button>
        </div>
      )}

      {/* Active spotlight banner (persists across reloads via GET /promotions) */}
      {activeUntil && !successMessage && (
        <div className="mb-6 bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
          <svg className="w-6 h-6 text-green-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          <div>
            <p className="text-green-800 font-medium text-sm">Destaque ativo</p>
            <p className="text-green-700 text-xs mt-0.5">Seu perfil fica destacado até {formatUntil(activeUntil)}.</p>
          </div>
        </div>
      )}

      {/* Error message */}
      {errorMessage && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-red-800 text-sm">{errorMessage}</p>
        </div>
      )}

      {/* Benefits */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Beneficios exclusivos</h2>
        <ul className="space-y-3">
          {BENEFITS.map((b) => (
            <li key={b} className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-yellow-50 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              </div>
              <span className="text-sm text-gray-700">{b}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Price and CTA */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">Por apenas</p>
            <p className="text-2xl font-bold text-gray-900">
              R$ {priceFormatted}
              <span className="text-sm font-normal text-gray-500"> / {SPOTLIGHT_DURATION_DAYS} dias</span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => { setShowConfirm(true); setErrorMessage(null); }}
            disabled={activating || !!successMessage || !!activeUntil}
            className="px-6 py-3 bg-yellow-500 text-white rounded-xl font-medium hover:bg-yellow-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {activeUntil ? 'Destaque ativo' : 'Ativar destaque'}
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-3 text-center">Cancele a qualquer momento</p>
      </div>

      {/* Confirmation modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl w-full max-w-sm mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Confirmar pagamento</h3>
            <p className="text-sm text-gray-600 mb-4">
              Confirmar pagamento de <strong>R$ {priceFormatted}</strong>?
              <br />
              Seu perfil sera destaque por {SPOTLIGHT_DURATION_DAYS} dias.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                className="flex-1 py-2 border border-gray-300 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-100 transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={activating}
                className="flex-1 py-2 bg-yellow-500 text-white rounded-xl text-sm font-medium hover:bg-yellow-600 transition disabled:opacity-50"
              >
                {activating ? 'Ativando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
