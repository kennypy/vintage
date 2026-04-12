'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { apiGet, apiPost } from '@/lib/api';

interface OrderDetail {
  id: string;
  status: string;
  totalBrl: number;
  shippingBrl?: number;
  platformFeeBrl?: number;
  createdAt: string;
  trackingCode?: string;
  carrier?: string;
  listing?: {
    id: string;
    title: string;
    imageUrl?: string;
    priceBrl: number;
    condition: string;
    size: string;
  };
  seller?: { id: string; name: string; avatarUrl?: string };
  buyer?: { id: string; name: string; avatarUrl?: string };
  payment?: { method: string; status: string };
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
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function OrderDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    const token =
      typeof window !== 'undefined' ? localStorage.getItem('vintage_token') : null;
    if (!token) {
      router.push('/auth/login');
      return;
    }

    apiGet<OrderDetail>(`/orders/${params.id}`)
      .then(setOrder)
      .catch(() => router.push('/orders'))
      .finally(() => setLoading(false));
  }, [router, params.id]);

  const handleConfirmDelivery = async () => {
    if (!order) return;
    setConfirming(true);
    try {
      await apiPost(`/orders/${order.id}/confirm-delivery`);
      setOrder((prev) => prev ? { ...prev, status: 'COMPLETED' } : prev);
    } catch (_err) {
      // keep existing state
    } finally {
      setConfirming(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-48" />
          <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
            <div className="flex gap-4">
              <div className="w-24 h-24 bg-gray-200 rounded-xl" />
              <div className="flex-1 space-y-2">
                <div className="h-5 bg-gray-200 rounded w-3/4" />
                <div className="h-4 bg-gray-200 rounded w-1/2" />
                <div className="h-4 bg-gray-200 rounded w-1/4" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!order) return null;

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/orders" className="text-sm text-brand-600 hover:text-brand-700">
          ← Meus pedidos
        </Link>
      </div>

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">
          Pedido #{order.id.slice(0, 8).toUpperCase()}
        </h1>
        <span
          className={`text-sm font-medium px-3 py-1 rounded-full ${
            STATUS_COLORS[order.status] ?? 'bg-gray-100 text-gray-700'
          }`}
        >
          {STATUS_LABELS[order.status] ?? order.status}
        </span>
      </div>

      {/* Product card */}
      {order.listing && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
          <div className="flex gap-4">
            <div className="relative w-24 h-24 bg-gray-100 rounded-xl flex-shrink-0 overflow-hidden">
              {order.listing.imageUrl ? (
                <Image
                  src={order.listing.imageUrl}
                  alt={order.listing.title}
                  fill
                  className="object-cover"
                  sizes="96px"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-400 text-3xl">
                  👗
                </div>
              )}
            </div>
            <div className="flex-1">
              <Link
                href={`/listings/${order.listing.id}`}
                className="text-sm font-medium text-gray-900 hover:text-brand-600 transition"
              >
                {order.listing.title}
              </Link>
              <p className="text-xs text-gray-500 mt-1">
                Tamanho {order.listing.size} · {order.listing.condition}
              </p>
              <p className="text-sm font-bold text-gray-900 mt-2">
                {formatBRL(order.listing.priceBrl)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Order details */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4 space-y-3">
        <h2 className="text-sm font-semibold text-gray-900">Detalhes do pedido</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Data do pedido</span>
            <span className="text-gray-900">{formatDate(order.createdAt)}</span>
          </div>
          {order.payment && (
            <div className="flex justify-between">
              <span className="text-gray-500">Pagamento</span>
              <span className="text-gray-900 capitalize">{order.payment.method}</span>
            </div>
          )}
          {order.shippingBrl !== undefined && (
            <div className="flex justify-between">
              <span className="text-gray-500">Frete</span>
              <span className="text-gray-900">{formatBRL(order.shippingBrl)}</span>
            </div>
          )}
          {order.platformFeeBrl !== undefined && (
            <div className="flex justify-between">
              <span className="text-gray-500">Taxa de proteção</span>
              <span className="text-gray-900">{formatBRL(order.platformFeeBrl)}</span>
            </div>
          )}
          <div className="flex justify-between font-semibold pt-2 border-t border-gray-100">
            <span className="text-gray-900">Total</span>
            <span className="text-gray-900">{formatBRL(order.totalBrl)}</span>
          </div>
        </div>
      </div>

      {/* Tracking */}
      {order.trackingCode && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
          <h2 className="text-sm font-semibold text-gray-900 mb-2">Rastreamento</h2>
          <p className="text-xs text-gray-500">
            {order.carrier ?? 'Transportadora'} · {order.trackingCode}
          </p>
        </div>
      )}

      {/* Parties */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6 space-y-3">
        {order.seller && (
          <div className="flex items-center gap-3">
            <div className="relative w-9 h-9 bg-brand-100 rounded-full flex items-center justify-center text-brand-600 font-bold text-sm flex-shrink-0 overflow-hidden">
              {order.seller.avatarUrl ? (
                <Image src={order.seller.avatarUrl} alt={order.seller.name} width={36} height={36} className="rounded-full object-cover" sizes="36px" />
              ) : (
                order.seller.name.charAt(0)
              )}
            </div>
            <div>
              <p className="text-xs text-gray-500">Vendedor</p>
              <p className="text-sm font-medium text-gray-900">{order.seller.name}</p>
            </div>
            <Link
              href={`/messages?with=${order.seller.id}&order=${order.id}`}
              className="ml-auto text-xs text-brand-600 hover:text-brand-700 font-medium"
            >
              Mensagem
            </Link>
          </div>
        )}
      </div>

      {/* Actions */}
      {order.status === 'DELIVERED' && (
        <button
          onClick={handleConfirmDelivery}
          disabled={confirming}
          className="w-full py-3 bg-brand-600 text-white rounded-xl font-medium hover:bg-brand-700 transition disabled:opacity-50"
        >
          {confirming ? 'Confirmando...' : 'Confirmar recebimento'}
        </button>
      )}
    </div>
  );
}
