'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { apiPatch } from '@/lib/api';
import { useApiQuery } from '@/lib/useApiQuery';
import { CounterOfferModal } from '@/components/CounterOfferModal';

interface Offer {
  id: string;
  amountBrl: number;
  status: string;
  counteredById: string | null;
  counterCount: number;
  parentOfferId: string | null;
  createdAt: string;
  expiresAt: string;
  listingId?: string;
}

interface Listing {
  id: string;
  priceBrl: number;
}

export default function OfferThreadPage() {
  const params = useParams<{ id: string }>();
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [counterOpen, setCounterOpen] = useState(false);

  const { data: thread, loading, error: threadError, refetch } = useApiQuery<Offer[]>(
    params?.id ? `/offers/${params.id}/thread` : null,
    { requireAuth: true },
  );
  const { data: meData, error: meError } = useApiQuery<{ id: string }>('/users/me', {
    requireAuth: true,
  });
  const me = meData?.id ?? null;
  // Pull the listing price so the modal can show the 50%-floor hint
  // matching the server-side validation in offers.service.ts.
  const listingId = thread?.[0]?.listingId ?? null;
  const { data: listing } = useApiQuery<Listing>(
    listingId ? `/listings/${listingId}` : null,
    { requireAuth: true },
  );
  const error = actionError ?? threadError ?? meError;

  if (loading) return <p className="p-6 text-gray-500">Carregando…</p>;
  if (threadError) {
    return <p className="p-6 text-sm text-red-600" role="alert">{threadError}</p>;
  }
  if (!thread || thread.length === 0) {
    return <p className="p-6 text-gray-500">Nenhuma oferta nesta negociação.</p>;
  }

  const latest = thread[thread.length - 1];
  // Status mirrors Prisma OfferStatus — API returns UPPERCASE.
  const canAct = latest.status === 'PENDING' && latest.counteredById !== me;

  const doAction = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
      await refetch();
    } catch (err) {
      setActionError(
        err instanceof Error && err.message ? err.message : String(err).slice(0, 200),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="mb-6 text-3xl font-bold">Negociação</h1>
      <ol className="mb-6 space-y-3">
        {thread.map((o, i) => (
          <li
            key={o.id}
            className={`rounded-lg p-3 ${
              o.counteredById === me
                ? 'ml-12 bg-blue-600 text-white'
                : 'mr-12 bg-white'
            }`}
          >
            <p className="font-bold">R$ {Number(o.amountBrl).toFixed(2)}</p>
            <p className="text-xs opacity-80">
              {o.counteredById === me ? 'Você' : 'Outra parte'} · {o.status} · rodada {i + 1}
            </p>
          </li>
        ))}
      </ol>
      {canAct && (
        <div className="space-y-3">
          <button
            className="w-full rounded-lg bg-blue-600 p-3 font-semibold text-white disabled:opacity-50"
            disabled={busy}
            onClick={() => doAction(() => apiPatch(`/offers/${latest.id}/accept`))}
          >
            Aceitar R$ {Number(latest.amountBrl).toFixed(2)}
          </button>
          <button
            className="w-full rounded-lg bg-red-600 p-3 font-semibold text-white disabled:opacity-50"
            disabled={busy}
            onClick={() => doAction(() => apiPatch(`/offers/${latest.id}/reject`))}
          >
            Recusar
          </button>
          <button
            className="w-full rounded-lg bg-orange-500 p-3 font-semibold text-white disabled:opacity-50"
            disabled={busy}
            onClick={() => setCounterOpen(true)}
          >
            Contrapropor
          </button>
          {error && <p className="text-red-600" role="alert">{error}</p>}
        </div>
      )}
      <CounterOfferModal
        open={counterOpen}
        offerId={latest.id}
        listingPriceBrl={listing ? Number(listing.priceBrl) : null}
        onClose={() => setCounterOpen(false)}
        onSuccess={refetch}
      />
    </main>
  );
}
