'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiGet } from '@/lib/api';

interface Order {
  id: string;
  status: string;
  totalBrl: number;
  createdAt: string;
  listing?: {
    title: string;
    imageUrl?: string;
  };
  seller?: { name: string };
  buyer?: { name: string };
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Aguardando pagamento',
  PAID: 'Pago',
  SHIPPED: 'Enviado',
  DELIVERED: 'Entregue',
  COMPLETED: 'Concluído',
  CANCELLED: 'Cancelado',
  DISPUTED: 'Em disputa',
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800',
  PAID: 'bg-blue-100 text-blue-800',
  SHIPPED: 'bg-purple-100 text-purple-800',
  DELIVERED: 'bg-green-100 text-green-800',
  COMPLETED: 'bg-green-100 text-green-800',
  CANCELLED: 'bg-red-100 text-red-800',
  DISPUTED: 'bg-orange-100 text-orange-800',
};

function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export default function OrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'compras' | 'vendas'>('compras');

  useEffect(() => {
    const token =
      typeof window !== 'undefined' ? localStorage.getItem('vintage_token') : null;
    if (!token) {
      router.push('/auth/login');
      return;
    }

    const endpoint = tab === 'compras' ? '/orders?role=buyer' : '/orders?role=seller';
    apiGet<Order[] | { data: Order[] }>(endpoint)
      .then((res) => {
        setOrders(Array.isArray(res) ? res : (res.data ?? []));
      })
      .catch(() => {
        setOrders([]);
        setError('Não foi possível carregar os dados. Tente novamente.');
      })
      .finally(() => setLoading(false));
  }, [router, tab]);

  const handleTabChange = (newTab: 'compras' | 'vendas') => {
    setTab(newTab);
    setLoading(true);
    setOrders([]);
    setError(null);
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Meus pedidos</h1>

      {error && <div className="text-center py-8 text-red-500">{error}</div>}

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <div className="flex gap-6">
          {(['compras', 'vendas'] as const).map((t) => (
            <button
              key={t}
              onClick={() => handleTabChange(t)}
              className={`pb-3 text-sm font-medium border-b-2 transition capitalize ${
                tab === t
                  ? 'border-brand-600 text-brand-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t === 'compras' ? 'Compras' : 'Vendas'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="animate-pulse bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex gap-4">
                <div className="w-16 h-16 bg-gray-200 rounded-lg flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-3/4" />
                  <div className="h-3 bg-gray-200 rounded w-1/2" />
                  <div className="h-3 bg-gray-200 rounded w-1/4" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-500 mb-4">
            {tab === 'compras'
              ? 'Você ainda não fez nenhuma compra.'
              : 'Você ainda não realizou nenhuma venda.'}
          </p>
          {tab === 'compras' && (
            <Link
              href="/listings"
              className="inline-block px-6 py-2 bg-brand-600 text-white rounded-xl text-sm font-medium hover:bg-brand-700 transition"
            >
              Explorar peças
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <Link
              key={order.id}
              href={`/orders/${order.id}`}
              className="flex gap-4 bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md transition"
            >
              <div className="relative w-16 h-16 bg-gray-100 rounded-lg flex-shrink-0 overflow-hidden">
                {order.listing?.imageUrl ? (
                  <Image
                    src={order.listing.imageUrl}
                    alt={order.listing.title ?? 'Produto'}
                    fill
                    className="object-cover"
                    sizes="64px"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-400 text-2xl">
                    👗
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {order.listing?.title ?? `Pedido ${order.id.slice(0, 8)}`}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {tab === 'compras'
                    ? `Vendedor: ${order.seller?.name ?? '—'}`
                    : `Comprador: ${order.buyer?.name ?? '—'}`}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {formatDate(order.createdAt)}
                </p>
              </div>
              <div className="flex flex-col items-end gap-2 flex-shrink-0">
                <p className="text-sm font-bold text-gray-900">
                  {formatBRL(order.totalBrl)}
                </p>
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    STATUS_COLORS[order.status] ?? 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {STATUS_LABELS[order.status] ?? order.status}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
