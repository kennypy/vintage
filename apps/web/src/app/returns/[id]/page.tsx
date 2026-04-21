'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiGet, apiPatch } from '@/lib/api';

interface OrderReturn {
  id: string;
  status: string;
  reason: string;
  description: string;
  returnTrackingCode: string | null;
  returnCarrier: string | null;
  returnLabelUrl: string | null;
  rejectionReason: string | null;
  createdAt: string;
  order: {
    id: string;
    listing: { title: string };
    buyer: { id: string; name: string };
    seller: { id: string; name: string };
  };
}

const STATUS_LABELS: Record<string, string> = {
  REQUESTED: 'Solicitada',
  APPROVED: 'Aprovada',
  REJECTED: 'Recusada',
  SHIPPED: 'Enviada',
  RECEIVED: 'Recebida',
  REFUNDED: 'Reembolsada',
  DISPUTED: 'Em disputa',
};

export default function ReturnDetailPage() {
  const params = useParams<{ id: string }>();
  const [ret, setRet] = useState<OrderReturn | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    if (!params?.id) return;
    const data = await apiGet<OrderReturn>(`/returns/${params.id}`);
    setRet(data);
  };

  useEffect(() => {
    apiGet<{ id: string }>('/users/me').then((u) => setMe(u.id)).catch(() => {});
    refresh();
  }, [params?.id]);

  if (!ret) return <p className="p-6 text-gray-500">Carregando…</p>;

  const isBuyer = me === ret.order.buyer.id;
  const isSeller = me === ret.order.seller.id;

  const doAction = async (path: string, body?: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await apiPatch(`/returns/${ret.id}/${path}`, body ?? {});
      await refresh();
    } catch (err) {
      setError(String(err).slice(0, 200));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="mb-2 text-3xl font-bold">{ret.order.listing.title}</h1>
      <p className="mb-6 text-lg font-semibold text-blue-600">
        {STATUS_LABELS[ret.status] ?? ret.status}
      </p>
      <dl className="mb-6 space-y-3">
        <div>
          <dt className="text-sm font-semibold text-gray-600">Motivo</dt>
          <dd>{ret.reason}</dd>
        </div>
        <div>
          <dt className="text-sm font-semibold text-gray-600">Descrição</dt>
          <dd className="whitespace-pre-wrap">{ret.description}</dd>
        </div>
        {ret.returnTrackingCode && (
          <div>
            <dt className="text-sm font-semibold text-gray-600">Rastreio</dt>
            <dd>{ret.returnTrackingCode} — {ret.returnCarrier}</dd>
          </div>
        )}
      </dl>
      {ret.returnLabelUrl && (
        <a
          href={ret.returnLabelUrl}
          target="_blank"
          rel="noreferrer"
          className="mb-4 inline-block rounded-lg border border-blue-600 px-4 py-2 font-semibold text-blue-600"
        >
          Abrir etiqueta de retorno
        </a>
      )}
      {error && <p className="mb-4 text-red-600">{error}</p>}
      <div className="space-y-3">
        {isSeller && ret.status === 'REQUESTED' && (
          <>
            <button
              className="w-full rounded-lg bg-blue-600 p-3 font-semibold text-white disabled:opacity-50"
              disabled={busy}
              onClick={() => doAction('approve')}
            >
              Aprovar devolução (gerar etiqueta)
            </button>
            <button
              className="w-full rounded-lg bg-red-600 p-3 font-semibold text-white disabled:opacity-50"
              disabled={busy}
              onClick={() => {
                const reason = prompt('Motivo da recusa (escalará para disputa):');
                if (reason && reason.length >= 10) doAction('reject', { reason });
              }}
            >
              Recusar devolução
            </button>
          </>
        )}
        {isBuyer && ret.status === 'APPROVED' && (
          <button
            className="w-full rounded-lg bg-blue-600 p-3 font-semibold text-white disabled:opacity-50"
            disabled={busy}
            onClick={() => doAction('mark-shipped')}
          >
            Marcar como enviado
          </button>
        )}
        {isSeller && ret.status === 'RECEIVED' && (
          <>
            <button
              className="w-full rounded-lg bg-blue-600 p-3 font-semibold text-white disabled:opacity-50"
              disabled={busy}
              onClick={() => doAction('inspect-approve')}
            >
              Aprovar reembolso
            </button>
            <button
              className="w-full rounded-lg bg-red-600 p-3 font-semibold text-white disabled:opacity-50"
              disabled={busy}
              onClick={() => {
                const reason = prompt('Motivo (escalará para disputa):');
                if (reason && reason.length >= 10) doAction('inspect-reject', { reason });
              }}
            >
              Rejeitar após inspeção
            </button>
          </>
        )}
      </div>
    </main>
  );
}
