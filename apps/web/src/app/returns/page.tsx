'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiGet } from '@/lib/api';

interface ReturnItem {
  id: string;
  status: string;
  createdAt: string;
  order?: { listing: { title: string } };
}

interface ReturnsResponse {
  items: ReturnItem[];
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

export default function ReturnsPage() {
  const [tab, setTab] = useState<'sent' | 'received'>('sent');
  const [items, setItems] = useState<ReturnItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiGet<ReturnsResponse>(`/returns?type=${tab}`)
      .then((resp) => setItems(resp.items ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [tab]);

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="mb-6 text-3xl font-bold">Devoluções</h1>
      <div className="mb-6 flex gap-2">
        {(['sent', 'received'] as const).map((t) => (
          <button
            key={t}
            className={`flex-1 rounded-lg p-3 font-medium ${
              tab === t ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-800'
            }`}
            onClick={() => setTab(t)}
          >
            {t === 'sent' ? 'Minhas solicitações' : 'Recebidas (vendedor)'}
          </button>
        ))}
      </div>
      {loading ? (
        <p className="text-gray-500">Carregando…</p>
      ) : items.length === 0 ? (
        <p className="text-center text-gray-500">Nenhuma devolução ainda.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((ret) => (
            <li key={ret.id}>
              <Link
                href={`/returns/${ret.id}`}
                className="block rounded-lg bg-white p-4 shadow-sm hover:shadow-md"
              >
                <p className="font-semibold">{ret.order?.listing.title ?? 'Pedido'}</p>
                <p className="mt-1 text-sm text-blue-600">
                  {STATUS_LABELS[ret.status] ?? ret.status}
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  {new Date(ret.createdAt).toLocaleDateString('pt-BR')}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
