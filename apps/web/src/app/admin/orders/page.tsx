'use client';

import { useEffect, useState } from 'react';
import { apiGet, apiPost } from '@/lib/api';

interface HeldOrder {
  id: string;
  status: string;
  itemPriceBrl: number;
  escrowReleasesAt: string | null;
  listing: { title: string };
  buyer: { id: string; name: string; email: string };
  seller: { id: string; name: string; email: string };
}

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<HeldOrder[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    try {
      const data = await apiGet<HeldOrder[]>('/admin/orders/held');
      setOrders(data);
    } catch (err) {
      setError(String(err).slice(0, 200));
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const forceRelease = async (id: string) => {
    const reason = prompt('Motivo para forçar liberação:');
    if (!reason) return;
    setBusy(id);
    try {
      await apiPost(`/admin/orders/${id}/force-release`, { reason });
      await refresh();
    } catch (err) {
      setError(String(err).slice(0, 200));
    } finally {
      setBusy(null);
    }
  };

  const forceHold = async (id: string) => {
    const reason = prompt('Motivo para forçar re-hold:');
    if (!reason) return;
    setBusy(id);
    try {
      await apiPost(`/admin/orders/${id}/force-hold`, { reason });
      await refresh();
    } catch (err) {
      setError(String(err).slice(0, 200));
    } finally {
      setBusy(null);
    }
  };

  return (
    <main className="mx-auto max-w-5xl p-6">
      <h1 className="mb-6 text-3xl font-bold">Pedidos em custódia</h1>
      {error && <p className="mb-4 text-red-600">{error}</p>}
      {orders.length === 0 ? (
        <p className="text-gray-500">Nenhum pedido em custódia no momento.</p>
      ) : (
        <table className="w-full border-collapse rounded-lg bg-white">
          <thead>
            <tr className="border-b bg-gray-50 text-left">
              <th className="p-3">Pedido</th>
              <th className="p-3">Item</th>
              <th className="p-3">Vendedor</th>
              <th className="p-3">Valor</th>
              <th className="p-3">Libera em</th>
              <th className="p-3">Ações</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-b">
                <td className="p-3 font-mono text-xs">{o.id.slice(0, 8)}</td>
                <td className="p-3">{o.listing.title}</td>
                <td className="p-3">
                  {o.seller.name} <span className="text-xs text-gray-500">{o.seller.email}</span>
                </td>
                <td className="p-3">R$ {Number(o.itemPriceBrl).toFixed(2)}</td>
                <td className="p-3">
                  {o.escrowReleasesAt
                    ? new Date(o.escrowReleasesAt).toLocaleString('pt-BR')
                    : '—'}
                </td>
                <td className="space-x-2 p-3">
                  <button
                    onClick={() => forceRelease(o.id)}
                    disabled={busy === o.id}
                    className="rounded bg-blue-600 px-3 py-1 text-sm text-white disabled:opacity-50"
                  >
                    Liberar
                  </button>
                  <button
                    onClick={() => forceHold(o.id)}
                    disabled={busy === o.id}
                    className="rounded bg-yellow-600 px-3 py-1 text-sm text-white disabled:opacity-50"
                  >
                    Re-hold
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
