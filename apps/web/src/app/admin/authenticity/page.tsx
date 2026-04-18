'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPatch } from '@/lib/api';

interface AuthenticityRequest {
  id: string;
  listingId: string;
  sellerId: string;
  proofImageUrls: string[];
  status: string;
  createdAt: string;
  listing: {
    id: string;
    title: string;
    images: Array<{ url: string }>;
  };
  seller: {
    id: string;
    name: string;
    avatarUrl: string | null;
  };
}

interface Paginated {
  items: AuthenticityRequest[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export default function AdminAuthenticityPage() {
  const [data, setData] = useState<Paginated | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await apiGet<Paginated>('/admin/authenticity/pending');
      setData(res);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Erro ao carregar fila.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const review = async (requestId: string, decision: 'APPROVED' | 'REJECTED') => {
    const note = typeof window !== 'undefined'
      ? window.prompt(
          decision === 'APPROVED'
            ? 'Comentário opcional para o vendedor (aprovação):'
            : 'Motivo da rejeição (será enviado ao vendedor):',
          '',
        )
      : null;
    // Rejection requires a note; approval note is optional.
    if (decision === 'REJECTED' && !(note ?? '').trim()) return;

    setPending(requestId);
    try {
      await apiPatch(`/admin/authenticity/${encodeURIComponent(requestId)}/review`, {
        decision,
        reviewNote: note?.trim().slice(0, 500) || undefined,
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Não foi possível registrar a decisão.');
    } finally {
      setPending(null);
    }
  };

  if (loading) return <div className="animate-pulse h-64 bg-white border rounded-xl" />;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Autenticidade — fila</h1>
        <p className="text-sm text-gray-500 mt-1">
          Pedidos de selo &quot;Autêntico&quot; aguardando revisão. Triagem FIFO;
          aprovação marca o listing como autêntico, rejeição notifica o vendedor.
        </p>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700" role="alert">
          {error}
        </div>
      )}

      {!data || data.items.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
          <p className="text-sm text-gray-700">Nenhuma solicitação pendente.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {data.items.map((req) => {
            const listingImg = req.listing.images[0]?.url;
            return (
              <li key={req.id} className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="flex items-start gap-4 mb-3">
                  {listingImg && (
                    <img
                      src={listingImg}
                      alt=""
                      className="w-16 h-20 object-cover rounded-md flex-shrink-0 bg-gray-100"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <h2 className="text-sm font-semibold text-gray-900 truncate">
                      {req.listing.title}
                    </h2>
                    <p className="text-xs text-gray-500 mt-1">
                      Vendedor: <strong>{req.seller.name}</strong> ·
                      {' '}Enviado em {new Date(req.createdAt).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                </div>

                {req.proofImageUrls.length > 0 && (
                  <div className="grid grid-cols-4 gap-2 mb-3">
                    {req.proofImageUrls.map((url, i) => (
                      <img
                        key={i}
                        src={url}
                        alt={`Prova ${i + 1}`}
                        className="w-full aspect-square object-cover rounded-md bg-gray-100"
                      />
                    ))}
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => review(req.id, 'APPROVED')}
                    disabled={pending === req.id}
                    className="px-4 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                  >
                    Aprovar (autêntico)
                  </button>
                  <button
                    type="button"
                    onClick={() => review(req.id, 'REJECTED')}
                    disabled={pending === req.id}
                    className="px-4 py-1.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
                  >
                    Rejeitar
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
