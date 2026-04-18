'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPatch } from '@/lib/api';
import { formatBRL } from '@/lib/i18n';

type PayoutStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
type PixKeyType = 'PIX_CPF' | 'PIX_CNPJ' | 'PIX_EMAIL' | 'PIX_PHONE' | 'PIX_RANDOM';

interface AdminPayoutRow {
  id: string;
  userId: string;
  amountBrl: number;
  status: PayoutStatus;
  snapshotType: PixKeyType;
  externalId: string | null;
  failureReason: string | null;
  requestedAt: string;
  processingAt: string | null;
  completedAt: string | null;
  user: { id: string; name: string; email: string };
}

interface Paginated {
  items: AdminPayoutRow[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

const STATUS_FILTERS: ReadonlyArray<{ value: PayoutStatus | 'QUEUE'; label: string }> = [
  { value: 'QUEUE',      label: 'Fila (PENDING + PROCESSING)' },
  { value: 'COMPLETED',  label: 'Concluídos' },
  { value: 'FAILED',     label: 'Falhou' },
];

const STATUS_CLASS: Record<PayoutStatus, string> = {
  PENDING:    'bg-yellow-50 text-yellow-700',
  PROCESSING: 'bg-blue-50 text-blue-700',
  COMPLETED:  'bg-green-50 text-green-700',
  FAILED:     'bg-red-50 text-red-700',
};

export default function AdminPayoutsPage() {
  const [filter, setFilter] = useState<PayoutStatus | 'QUEUE'>('QUEUE');
  const [data, setData] = useState<Paginated | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const q = filter === 'QUEUE' ? '' : `?status=${filter}`;
      const res = await apiGet<Paginated>(`/wallet/admin/payouts${q}`);
      setData(res);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Erro ao carregar saques.');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { void refresh(); }, [refresh]);

  // COMPLETED = marked by ops after processing PIX out-of-band (flag off).
  // FAILED = refunds the wallet atomically via PayoutsService.
  const markStatus = async (id: string, next: 'COMPLETED' | 'FAILED') => {
    let failureReason: string | null = null;
    if (next === 'FAILED') {
      failureReason = typeof window !== 'undefined'
        ? window.prompt('Motivo da falha (enviado ao seller):', '')
        : null;
      if (!failureReason || !failureReason.trim()) return;
    } else {
      if (typeof window !== 'undefined' && !window.confirm('Marcar este saque como Concluído?')) return;
    }

    setPending(id);
    try {
      await apiPatch(`/wallet/admin/payouts/${encodeURIComponent(id)}/status`, {
        status: next,
        failureReason: failureReason?.trim().slice(0, 500) || undefined,
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Erro ao atualizar saque.');
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Saques</h1>
        <p className="text-sm text-gray-500 mt-1">
          Enquanto o contrato Marketplace do Mercado Pago não estiver ativo,
          ops processa o PIX fora da plataforma e marca aqui o resultado. FAILED
          estorna o saldo automaticamente.
        </p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={`px-3 py-1.5 text-sm rounded-full border ${
              filter === f.value
                ? 'border-brand-500 bg-brand-50 text-brand-700 font-semibold'
                : 'border-gray-300 text-gray-600 hover:border-gray-400'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700" role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <div className="animate-pulse h-32 bg-white border rounded-xl" />
      ) : !data || data.items.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
          <p className="text-sm text-gray-700">Nenhum saque nesta categoria.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {data.items.map((p) => (
            <li key={p.id} className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">
                    {formatBRL(p.amountBrl)} ·
                    {' '}
                    <span className="text-gray-500 font-normal">
                      {p.snapshotType.replace('PIX_', '')}
                    </span>
                  </p>
                  <p className="text-xs text-gray-500 mt-1 truncate">
                    {p.user.name} ({p.user.email})
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Solicitado em {new Date(p.requestedAt).toLocaleString('pt-BR')}
                    {p.externalId && <> · MP ref <code>{p.externalId}</code></>}
                  </p>
                  {p.failureReason && (
                    <p className="text-xs text-red-600 mt-1 truncate">
                      Motivo da falha: {p.failureReason}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_CLASS[p.status]}`}
                  >
                    {p.status}
                  </span>
                  {(p.status === 'PENDING' || p.status === 'PROCESSING') && (
                    <>
                      <button
                        type="button"
                        onClick={() => markStatus(p.id, 'COMPLETED')}
                        disabled={pending === p.id}
                        className="px-3 py-1.5 bg-green-600 text-white rounded-md text-xs font-semibold hover:bg-green-700 disabled:opacity-50"
                      >
                        Concluir
                      </button>
                      <button
                        type="button"
                        onClick={() => markStatus(p.id, 'FAILED')}
                        disabled={pending === p.id}
                        className="px-3 py-1.5 bg-red-600 text-white rounded-md text-xs font-semibold hover:bg-red-700 disabled:opacity-50"
                      >
                        Falhar + estornar
                      </button>
                    </>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
