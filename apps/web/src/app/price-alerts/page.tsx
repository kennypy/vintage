'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { apiDelete, apiGet } from '@/lib/api';

interface PriceAlert {
  id: string;
  listingId: string;
  title: string;
  status: string;
  imageUrl: string | null;
  originalPriceBrl: number;
  currentPriceBrl: number;
  dropped: boolean;
  dropPct: number;
  notifiedAt: string | null;
  createdAt: string;
}

const fmt = (v: number) =>
  `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function PriceAlertsPage() {
  const [items, setItems] = useState<PriceAlert[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    apiGet<{ items: PriceAlert[] }>('/price-alerts')
      .then((r) => setItems(r.items))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (id: string) => {
    if (!window.confirm('Remover este alerta?')) return;
    setItems((p) => p.filter((a) => a.id !== id));
    try {
      await apiDelete(`/price-alerts/${encodeURIComponent(id)}`);
    } catch {
      load();
    }
  };

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-3xl font-bold">Alertas de preço</h1>
      <p className="mt-1 text-gray-600">
        Avisamos quando o preço dos seus favoritos cair.
      </p>

      <div className="mt-6">
        {loading ? (
          <p className="text-gray-500">Carregando…</p>
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center">
            <p className="text-gray-600">Nenhum alerta ativo.</p>
            <p className="mt-2 text-sm text-gray-500">
              Favoritar um anúncio cria um alerta automaticamente.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {items.map((a) => (
              <li
                key={a.id}
                className="flex items-center gap-4 rounded-xl bg-white p-3 shadow-sm"
              >
                <Link href={`/listings/${a.listingId}`} className="flex flex-1 items-center gap-4">
                  {a.imageUrl ? (
                    <Image
                      src={a.imageUrl}
                      alt=""
                      width={56}
                      height={56}
                      className="h-14 w-14 rounded-lg object-cover"
                      unoptimized
                    />
                  ) : (
                    <div className="h-14 w-14 rounded-lg bg-gray-200" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="truncate font-medium text-gray-900">{a.title}</p>
                    <div className="mt-1 flex items-center gap-2 text-sm">
                      <span className="font-semibold text-gray-900">{fmt(a.currentPriceBrl)}</span>
                      {a.dropped && (
                        <>
                          <span className="text-xs text-gray-400 line-through">
                            {fmt(a.originalPriceBrl)}
                          </span>
                          <span className="rounded bg-brand-100 px-1.5 py-0.5 text-xs font-semibold text-brand-700">
                            -{a.dropPct}%
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </Link>
                <button
                  type="button"
                  onClick={() => remove(a.id)}
                  className="text-sm text-red-600 hover:underline"
                >
                  Remover
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
