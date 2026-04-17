'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { apiGet, apiPatch, apiPost } from '@/lib/api';
import { formatBRL, ORDER_STATUS_PT, ORDER_STATUS_COLORS } from '@/lib/i18n';

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

const STATUS_LABELS = ORDER_STATUS_PT;
const STATUS_COLORS = ORDER_STATUS_COLORS;

const CARRIERS = [
  { value: 'CORREIOS', label: 'Correios' },
  { value: 'SEDEX', label: 'Sedex' },
  { value: 'PAC', label: 'PAC' },
  { value: 'JADLOG', label: 'Jadlog' },
  { value: 'KANGU', label: 'Kangu' },
] as const;

type DisputeReason =
  | 'NOT_RECEIVED'
  | 'NOT_AS_DESCRIBED'
  | 'DAMAGED'
  | 'WRONG_ITEM'
  | 'COUNTERFEIT';

const DISPUTE_REASONS: { value: DisputeReason; label: string }[] = [
  { value: 'NOT_RECEIVED', label: 'Item n\u00e3o recebido' },
  { value: 'NOT_AS_DESCRIBED', label: 'Item diferente do an\u00fancio' },
  { value: 'DAMAGED', label: 'Item danificado' },
  { value: 'WRONG_ITEM', label: 'Item errado' },
  { value: 'COUNTERFEIT', label: 'Outro' },
];

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
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [showShipModal, setShowShipModal] = useState(false);
  const [selectedCarrier, setSelectedCarrier] = useState('');
  const [trackingCodeInput, setTrackingCodeInput] = useState('');
  const [shipping, setShipping] = useState(false);
  const [showDisputeForm, setShowDisputeForm] = useState(false);
  const [disputeReason, setDisputeReason] = useState<DisputeReason | ''>('');
  const [disputeDescription, setDisputeDescription] = useState('');
  const [disputeSubmitting, setDisputeSubmitting] = useState(false);
  const [disputeError, setDisputeError] = useState('');

  useEffect(() => {
    const token =
      typeof window !== 'undefined' ? localStorage.getItem('vintage_token') : null;
    if (!token) {
      router.push('/auth/login');
      return;
    }

    apiGet<{ id: string }>('/users/me')
      .then((me) => setCurrentUserId(me.id))
      .catch(() => {});

    apiGet<OrderDetail>(`/orders/${params.id}`)
      .then(setOrder)
      .catch(() => router.push('/orders'))
      .finally(() => setLoading(false));
  }, [router, params.id]);

  const handleConfirmDelivery = async () => {
    if (!order) return;
    setConfirming(true);
    try {
      await apiPatch(`/orders/${order.id}/confirm`);
      setOrder((prev) => prev ? { ...prev, status: 'COMPLETED' } : prev);
    } catch (_err) {
      // keep existing state
    } finally {
      setConfirming(false);
    }
  };

  const handleSubmitDispute = async () => {
    if (!order || !disputeReason) return;
    if (disputeDescription.trim().length < 20) {
      setDisputeError('A descri\u00e7\u00e3o deve ter pelo menos 20 caracteres.');
      return;
    }
    setDisputeSubmitting(true);
    setDisputeError('');
    try {
      await apiPost('/disputes', {
        orderId: order.id,
        reason: disputeReason,
        description: disputeDescription.trim(),
      });
      setOrder((prev) => prev ? { ...prev, status: 'DISPUTED' } : prev);
      setShowDisputeForm(false);
      setDisputeReason('');
      setDisputeDescription('');
    } catch (_err) {
      setDisputeError('N\u00e3o foi poss\u00edvel abrir a disputa. Tente novamente.');
    } finally {
      setDisputeSubmitting(false);
    }
  };

  const handleShip = async () => {
    if (!order || !selectedCarrier || !trackingCodeInput.trim()) return;
    setShipping(true);
    try {
      await apiPatch(`/orders/${order.id}/ship`, {
        trackingCode: trackingCodeInput.trim(),
        carrier: selectedCarrier,
      });
      setOrder((prev) =>
        prev
          ? { ...prev, status: 'SHIPPED', trackingCode: trackingCodeInput.trim(), carrier: selectedCarrier }
          : prev,
      );
      setShowShipModal(false);
      setSelectedCarrier('');
      setTrackingCodeInput('');
    } catch (_err) {
      alert('Erro ao marcar pedido como enviado.');
    } finally {
      setShipping(false);
    }
  };

  const isBuyer = currentUserId != null && order?.buyer?.id === currentUserId;
  const isSeller = currentUserId != null && order?.seller?.id === currentUserId;

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
      {order.status === 'PAID' && isSeller && (
        <button
          type="button"
          onClick={() => {
            setSelectedCarrier('');
            setTrackingCodeInput('');
            setShowShipModal(true);
          }}
          className="w-full py-3 bg-brand-600 text-white rounded-xl font-medium hover:bg-brand-700 transition mb-3"
        >
          Marcar como enviado
        </button>
      )}

      {order.status === 'DELIVERED' && (
        <button
          onClick={handleConfirmDelivery}
          disabled={confirming}
          className="w-full py-3 bg-brand-600 text-white rounded-xl font-medium hover:bg-brand-700 transition disabled:opacity-50"
        >
          {confirming ? 'Confirmando...' : 'Confirmar recebimento'}
        </button>
      )}

      {/* Dispute section */}
      {(order.status === 'DELIVERED' || order.status === 'SHIPPED') && isBuyer && (
        <div className="mt-4">
          {!showDisputeForm ? (
            <button
              onClick={() => setShowDisputeForm(true)}
              className="w-full py-3 bg-red-500 text-white rounded-xl font-medium hover:bg-red-600 transition"
            >
              Abrir disputa
            </button>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-900">Abrir disputa</h2>
                <button
                  onClick={() => { setShowDisputeForm(false); setDisputeError(''); }}
                  className="text-xs text-gray-500 hover:text-gray-700"
                >
                  Cancelar
                </button>
              </div>

              <div>
                <label htmlFor="dispute-reason" className="block text-sm font-medium text-gray-700 mb-1">
                  Motivo
                </label>
                <select
                  id="dispute-reason"
                  value={disputeReason}
                  onChange={(e) => setDisputeReason(e.target.value as DisputeReason)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                >
                  <option value="">Selecione o motivo...</option>
                  {DISPUTE_REASONS.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="dispute-description" className="block text-sm font-medium text-gray-700 mb-1">
                  Descricao (minimo 20 caracteres)
                </label>
                <textarea
                  id="dispute-description"
                  rows={4}
                  maxLength={1000}
                  value={disputeDescription}
                  onChange={(e) => setDisputeDescription(e.target.value)}
                  placeholder="Descreva com detalhes o que aconteceu..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 resize-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                />
                <p className="text-xs text-gray-400 text-right mt-1">
                  {disputeDescription.trim().length}/1000
                </p>
              </div>

              {disputeError && (
                <p className="text-sm text-red-600">{disputeError}</p>
              )}

              <button
                onClick={handleSubmitDispute}
                disabled={disputeSubmitting || !disputeReason || disputeDescription.trim().length < 20}
                className="w-full py-3 bg-red-500 text-white rounded-xl font-medium hover:bg-red-600 transition disabled:opacity-50"
              >
                {disputeSubmitting ? 'Enviando...' : 'Confirmar disputa'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Ship Modal */}
      {showShipModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md mx-4 shadow-xl">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Enviar pedido</h3>

            <label className="block text-sm font-semibold text-gray-700 mb-2">Transportadora</label>
            <div className="flex flex-wrap gap-2 mb-4">
              {CARRIERS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setSelectedCarrier(c.value)}
                  className={`px-4 py-2 rounded-lg border-2 text-sm font-medium transition ${
                    selectedCarrier === c.value
                      ? 'border-brand-600 bg-brand-50 text-brand-700'
                      : 'border-gray-200 text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>

            <label className="block text-sm font-semibold text-gray-700 mb-2">Codigo de rastreio</label>
            <input
              type="text"
              value={trackingCodeInput}
              onChange={(e) => setTrackingCodeInput(e.target.value)}
              placeholder="Ex: BR123456789XX"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-brand-600"
            />

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowShipModal(false)}
                className="flex-1 py-3 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleShip}
                disabled={shipping || !selectedCarrier || !trackingCodeInput.trim()}
                className="flex-1 py-3 rounded-xl bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {shipping ? 'Enviando...' : 'Confirmar envio'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
