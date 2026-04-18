'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPost } from '@/lib/api';
import { formatBRL } from '@/lib/i18n';

interface OpenDispute {
  id: string;
  reason: string;
  description?: string | null;
  createdAt: string;
  status: string;
  order: {
    id: string;
    totalBrl: number;
    listing: {
      id: string;
      title: string;
      images: Array<{ url: string }>;
    };
    seller: { id: string; name: string };
    buyer: { id: string; name: string };
  };
  openedBy: { id: string; name: string };
}

interface PaginatedOpen {
  items: OpenDispute[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export default function AdminDisputesPage() {
  const [data, setData] = useState<PaginatedOpen | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolving, setResolving] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await apiGet<PaginatedOpen>('/disputes/admin/open');
      setData(res);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Erro ao carregar disputas.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  // Prompt for the resolution text, then confirm the refund/release flag.
  // Deliberately minimal UI — this page is the ops-only triage surface,
  // not a rich admin dashboard. The service enforces the state machine.
  const resolve = async (disputeId: string, refund: boolean) => {
    const resolution = typeof window !== 'undefined'
      ? window.prompt(
          refund
            ? 'Nota de resolução (comprador ganha — estorno integral):'
            : 'Nota de resolução (vendedor ganha — libera escrow):',
          '',
        )
      : null;
    if (!resolution || !resolution.trim()) return;

    setResolving(disputeId);
    try {
      await apiPost(`/disputes/${encodeURIComponent(disputeId)}/resolve`, {
        resolution: resolution.trim().slice(0, 1000),
        refund,
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Não foi possível resolver.');
    } finally {
      setResolving(null);
    }
  };

  if (loading) return <div className="animate-pulse h-64 bg-white border rounded-xl" />;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Disputas em aberto</h1>
        <p className="text-sm text-gray-500 mt-1">
          Triagem FIFO: as disputas mais antigas aparecem primeiro. A decisão
          estorna (comprador ganha) ou libera o escrow (vendedor ganha).
        </p>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700" role="alert">
          {error}
        </div>
      )}

      {!data || data.items.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
          <p className="text-sm text-gray-700">Nenhuma disputa em aberto no momento.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {data.items.map((d) => {
            const img = d.order.listing.images[0]?.url;
            const openedDays = Math.floor((Date.now() - new Date(d.createdAt).getTime()) / 86_400_000);
            return (
              <li key={d.id} className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="flex items-start gap-4">
                  {img && (
                    <img
                      src={img}
                      alt=""
                      className="w-16 h-20 object-cover rounded-md flex-shrink-0 bg-gray-100"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <h2 className="text-sm font-semibold text-gray-900 truncate">
                      {d.order.listing.title}
                    </h2>
                    <p className="text-xs text-gray-500 mt-1">
                      Aberta há {openedDays}d por <strong>{d.openedBy.name}</strong> ·
                      {' '}Pedido {formatBRL(d.order.totalBrl)}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Vendedor: {d.order.seller.name} · Comprador: {d.order.buyer.name}
                    </p>
                    <div className="mt-2 p-2 bg-gray-50 rounded text-xs">
                      <p className="font-semibold text-gray-700">{d.reason}</p>
                      {d.description && (
                        <p className="text-gray-600 mt-1 whitespace-pre-wrap">{d.description}</p>
                      )}
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => resolve(d.id, true)}
                    disabled={resolving === d.id}
                    className="px-4 py-1.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
                  >
                    Estornar (comprador)
                  </button>
                  <button
                    type="button"
                    onClick={() => resolve(d.id, false)}
                    disabled={resolving === d.id}
                    className="px-4 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                  >
                    Liberar (vendedor)
                  </button>
                  {openedDays >= 2 && (
                    <span className="ml-auto px-2 py-1 text-xs font-semibold text-orange-700 bg-orange-50 rounded">
                      ⚠ SLA vencido
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
