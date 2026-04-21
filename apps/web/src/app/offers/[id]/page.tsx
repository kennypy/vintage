'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiGet, apiPatch, apiPost } from '@/lib/api';

interface Offer {
  id: string;
  amountBrl: number;
  status: string;
  counteredById: string | null;
  counterCount: number;
  parentOfferId: string | null;
  createdAt: string;
  expiresAt: string;
}

export default function OfferThreadPage() {
  const params = useParams<{ id: string }>();
  const [thread, setThread] = useState<Offer[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [counterAmount, setCounterAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    if (!params?.id) return;
    const data = await apiGet<Offer[]>(`/offers/${params.id}/thread`);
    setThread(data);
  };

  useEffect(() => {
    apiGet<{ id: string }>('/users/me').then((u) => setMe(u.id)).catch(() => {});
    refresh();
  }, [params?.id]);

  if (thread.length === 0) return <p className="p-6 text-gray-500">Carregando…</p>;

  const latest = thread[thread.length - 1];
  const canAct = latest.status === 'pending' && latest.counteredById !== me;

  const doAction = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await refresh();
    } catch (err) {
      setError(String(err).slice(0, 200));
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
          <div className="flex gap-2">
            <input
              type="number"
              step="0.01"
              className="flex-1 rounded-lg border border-gray-300 p-3"
              placeholder="R$ 0,00"
              value={counterAmount}
              onChange={(e) => setCounterAmount(e.target.value)}
            />
            <button
              className="rounded-lg bg-orange-500 px-4 font-semibold text-white disabled:opacity-50"
              disabled={busy}
              onClick={() => {
                const amt = Number(counterAmount);
                if (!amt || amt <= 0) {
                  setError('Informe um valor válido');
                  return;
                }
                doAction(() =>
                  apiPost(`/offers/${latest.id}/counter`, { amountBrl: amt }),
                );
              }}
            >
              Contrapropor
            </button>
          </div>
          {error && <p className="text-red-600">{error}</p>}
        </div>
      )}
    </main>
  );
}
