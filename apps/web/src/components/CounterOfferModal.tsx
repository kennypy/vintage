'use client';

import { useEffect, useState } from 'react';
import { apiPost } from '@/lib/api';
import { MIN_OFFER_PERCENTAGE } from '@vintage/shared';

/**
 * Counter-offer modal used from the messages thread (inline next to
 * an active offer banner) and from /offers/[id]. Matches the mobile
 * Modal UX in apps/mobile/app/conversation/[id].tsx — enter a new
 * amount, server validates 50% floor, thread refresh is the caller's
 * responsibility (onSuccess).
 *
 * Kept deliberately dumb: it doesn't fetch offers, it doesn't own
 * thread state. Consumers pass the offerId + the listing price to
 * render the local-floor hint.
 */
export function CounterOfferModal({
  open,
  offerId,
  listingPriceBrl,
  onClose,
  onSuccess,
}: {
  open: boolean;
  offerId: string | null;
  listingPriceBrl: number | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setAmount('');
      setError(null);
    }
  }, [open]);

  if (!open || !offerId) return null;

  const minFloor =
    listingPriceBrl !== null
      ? Number((listingPriceBrl * MIN_OFFER_PERCENTAGE).toFixed(2))
      : null;

  const submit = async () => {
    const parsed = Number(amount.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError('Informe um valor válido');
      return;
    }
    if (minFloor !== null && parsed < minFloor) {
      setError(
        `Valor mínimo: R$ ${minFloor.toFixed(2).replace('.', ',')} (50% do anúncio)`,
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiPost(`/offers/${offerId}/counter`, { amountBrl: parsed });
      onSuccess();
      onClose();
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : String(err).slice(0, 200),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="counter-offer-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <h2
          id="counter-offer-title"
          className="mb-1 text-lg font-semibold text-gray-900"
        >
          Fazer contraproposta
        </h2>
        <p className="mb-4 text-sm text-gray-600">
          Proponha um novo valor. A outra parte decide se aceita, recusa ou faz
          uma nova contraproposta.
        </p>
        <label className="mb-2 block text-xs font-medium text-gray-700">
          Valor em R$
        </label>
        <input
          type="text"
          inputMode="decimal"
          autoFocus
          disabled={busy}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0,00"
          className="mb-2 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base focus:border-transparent focus:outline-none focus:ring-2 focus:ring-brand-600 disabled:bg-gray-100"
        />
        {minFloor !== null && (
          <p className="mb-4 text-xs text-gray-500">
            Valor mínimo aceito: R$ {minFloor.toFixed(2).replace('.', ',')} (50% do
            anúncio)
          </p>
        )}
        {error && (
          <p className="mb-3 text-sm text-red-600" role="alert">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={busy || !amount}
            onClick={submit}
            className="flex-1 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {busy ? 'Enviando…' : 'Enviar'}
          </button>
        </div>
      </div>
    </div>
  );
}
