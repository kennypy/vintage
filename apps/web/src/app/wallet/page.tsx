'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiGet, apiPost } from '@/lib/api';
import { formatBRL } from '@/lib/i18n';

interface WalletBalance {
  availableBrl: number;
  pendingBrl: number;
  totalBrl: number;
}

interface WalletTransaction {
  id: string;
  type: 'sale' | 'payout' | 'refund' | 'fee';
  amountBrl: number;
  description: string;
  status: 'completed' | 'pending' | 'failed';
  createdAt: string;
}

type PixKeyType = 'PIX_CPF' | 'PIX_CNPJ' | 'PIX_EMAIL' | 'PIX_PHONE' | 'PIX_RANDOM';

interface PayoutMethodView {
  id: string;
  type: PixKeyType;
  pixKeyMasked: string;
  label: string | null;
  isDefault: boolean;
  createdAt: string;
}

type PayoutRequestStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

interface PayoutRequestView {
  id: string;
  amountBrl: number;
  status: PayoutRequestStatus;
  snapshotType: PixKeyType;
  requestedAt: string;
  completedAt: string | null;
  failureReason: string | null;
}

const PAYOUT_STATUS_LABEL: Record<PayoutRequestStatus, string> = {
  PENDING: 'Aguardando',
  PROCESSING: 'Processando',
  COMPLETED: 'Pago',
  FAILED: 'Falhou',
};
const PAYOUT_STATUS_CLASS: Record<PayoutRequestStatus, string> = {
  PENDING: 'bg-yellow-50 text-yellow-700',
  PROCESSING: 'bg-blue-50 text-blue-700',
  COMPLETED: 'bg-green-50 text-green-700',
  FAILED: 'bg-red-50 text-red-700',
};

const TYPE_LABELS: Record<string, string> = {
  sale: 'Venda',
  payout: 'Saque',
  refund: 'Reembolso',
  fee: 'Taxa',
};

const TYPE_COLORS: Record<string, string> = {
  sale: 'text-green-600',
  payout: 'text-blue-600',
  refund: 'text-orange-600',
  fee: 'text-red-600',
};

const STATUS_LABELS: Record<string, string> = {
  completed: 'Concluido',
  pending: 'Pendente',
  failed: 'Falhou',
};

const PIX_TYPE_LABELS: Record<PixKeyType, string> = {
  PIX_CPF: 'CPF',
  PIX_CNPJ: 'CNPJ',
  PIX_EMAIL: 'E-mail',
  PIX_PHONE: 'Telefone',
  PIX_RANDOM: 'Aleatória',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function WalletPage() {
  const router = useRouter();
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [methods, setMethods] = useState<PayoutMethodView[]>([]);
  const [payouts, setPayouts] = useState<PayoutRequestView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPayout, setShowPayout] = useState(false);
  const [selectedMethodId, setSelectedMethodId] = useState<string | null>(null);
  const [payoutAmount, setPayoutAmount] = useState('');
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [payoutError, setPayoutError] = useState<string | null>(null);

  const refreshAll = async () => {
    const [bal, txnsRaw, methodsData, payoutsData] = await Promise.all([
      apiGet<WalletBalance>('/wallet').catch(() => null),
      apiGet<{ items: WalletTransaction[] } | WalletTransaction[]>('/wallet/transactions').catch(() => []),
      apiGet<PayoutMethodView[]>('/wallet/payout-methods').catch(() => [] as PayoutMethodView[]),
      apiGet<{ items: PayoutRequestView[] }>('/wallet/payouts').catch(() => ({ items: [] as PayoutRequestView[] })),
    ]);
    if (bal) setBalance(bal);
    setTransactions(Array.isArray(txnsRaw) ? txnsRaw : (txnsRaw.items ?? []));
    setMethods(methodsData);
    setPayouts(payoutsData.items);
    const def = methodsData.find((m) => m.isDefault) ?? methodsData[0];
    if (def) setSelectedMethodId(def.id);
  };

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('vintage_token') : null;
    if (!token) {
      router.push('/auth/login');
      return;
    }

    refreshAll()
      .catch(() => setError('Não foi possível carregar os dados. Tente novamente.'))
      .finally(() => setLoading(false));
  }, [router]);

  const openPayoutForm = () => {
    setPayoutError(null);
    if (!balance || balance.availableBrl <= 0) {
      setPayoutError('Você não tem saldo disponível para saque.');
      return;
    }
    if (methods.length === 0) {
      setPayoutError('Cadastre uma chave PIX antes de solicitar o saque.');
      return;
    }
    setShowPayout(true);
  };

  const handlePayout = async () => {
    setPayoutError(null);
    if (!selectedMethodId) {
      setPayoutError('Selecione uma chave PIX.');
      return;
    }
    if (!payoutAmount.trim()) {
      setPayoutError('Informe um valor.');
      return;
    }
    const amount = parseFloat(payoutAmount.replace(',', '.'));
    if (isNaN(amount) || amount <= 0) {
      setPayoutError('Valor inválido.');
      return;
    }
    if (balance && amount > balance.availableBrl) {
      setPayoutError('Saldo insuficiente.');
      return;
    }
    setPayoutLoading(true);
    try {
      await apiPost('/wallet/payout', { amountBrl: amount, payoutMethodId: selectedMethodId });
      setShowPayout(false);
      setPayoutAmount('');
      await refreshAll();
    } catch (err) {
      setPayoutError(err instanceof Error && err.message ? err.message : 'Erro ao solicitar saque.');
    } finally {
      setPayoutLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded w-40" />
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => <div key={i} className="h-24 bg-gray-200 rounded-xl" />)}
          </div>
          <div className="h-64 bg-gray-200 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Carteira</h1>
        <Link
          href="/conta/payout-methods"
          className="text-sm text-brand-600 font-medium hover:text-brand-700"
        >
          Gerenciar chaves PIX →
        </Link>
      </div>

      {error && <div className="text-center py-8 text-red-500">{error}</div>}

      {/* Balance cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Disponivel</p>
          <p className="text-2xl font-bold text-green-600">{formatBRL(balance?.availableBrl ?? 0)}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Pendente</p>
          <p className="text-2xl font-bold text-yellow-600">{formatBRL(balance?.pendingBrl ?? 0)}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Total</p>
          <p className="text-2xl font-bold text-gray-900">{formatBRL(balance?.totalBrl ?? 0)}</p>
        </div>
      </div>

      {/* Payout button */}
      <button
        type="button"
        onClick={openPayoutForm}
        className="mb-6 px-6 py-3 bg-brand-600 text-white rounded-xl font-medium hover:bg-brand-700 transition"
      >
        Sacar via PIX
      </button>

      {payoutError && !showPayout && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700" role="alert">
          {payoutError}{' '}
          {methods.length === 0 && (
            <Link href="/conta/payout-methods" className="underline font-medium">
              Cadastrar chave agora
            </Link>
          )}
        </div>
      )}

      {/* Payout form */}
      {showPayout && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-900">Solicitar saque</h2>

          {payoutError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700" role="alert">
              {payoutError}
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-gray-600 uppercase block mb-2">
              Destino
            </label>
            <div className="space-y-2">
              {methods.map((m) => (
                <label
                  key={m.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer ${
                    selectedMethodId === m.id
                      ? 'border-brand-500 bg-brand-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="payoutMethod"
                    checked={selectedMethodId === m.id}
                    onChange={() => setSelectedMethodId(m.id)}
                    className="text-brand-600"
                  />
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-gray-500 uppercase">
                      {PIX_TYPE_LABELS[m.type]}
                      {m.isDefault && ' · padrão'}
                    </p>
                    <p className="text-sm font-mono text-gray-900">{m.pixKeyMasked}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-500 block mb-1">Valor (R$)</label>
            <input
              type="text"
              value={payoutAmount}
              onChange={(e) => setPayoutAmount(e.target.value)}
              placeholder="0,00"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
            />
            {balance && (
              <p className="text-xs text-gray-400 mt-1">Disponível: {formatBRL(balance.availableBrl)}</p>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handlePayout}
              disabled={payoutLoading}
              className="px-6 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 transition disabled:opacity-50"
            >
              {payoutLoading ? 'Processando...' : 'Solicitar saque'}
            </button>
            <button
              type="button"
              onClick={() => setShowPayout(false)}
              className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Payout requests (Wave 3C) */}
      {payouts.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Saques</h2>
          <ul className="space-y-2">
            {payouts.slice(0, 5).map((p) => (
              <li
                key={p.id}
                className="bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">
                    {formatBRL(p.amountBrl)}
                  </p>
                  <p className="text-xs text-gray-500">
                    {p.snapshotType.replace('PIX_', '')}
                    {' · '}
                    {new Date(p.requestedAt).toLocaleDateString('pt-BR')}
                  </p>
                  {p.status === 'FAILED' && p.failureReason && (
                    <p className="text-xs text-red-600 mt-1 truncate">
                      {p.failureReason}
                    </p>
                  )}
                </div>
                <span
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${PAYOUT_STATUS_CLASS[p.status]}`}
                >
                  {PAYOUT_STATUS_LABEL[p.status]}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Transactions */}
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Historico de transacoes</h2>
      {transactions.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500">Nenhuma transacao encontrada.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {transactions.map((tx) => (
            <div key={tx.id} className="bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`text-lg font-bold ${TYPE_COLORS[tx.type] ?? 'text-gray-600'}`}>
                  {tx.type === 'sale' || tx.type === 'refund' ? '+' : '-'}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">{tx.description}</p>
                  <p className="text-xs text-gray-500">
                    {TYPE_LABELS[tx.type] ?? tx.type} &middot; {formatDate(tx.createdAt)} &middot;{' '}
                    <span className={tx.status === 'completed' ? 'text-green-600' : tx.status === 'failed' ? 'text-red-600' : 'text-yellow-600'}>
                      {STATUS_LABELS[tx.status] ?? tx.status}
                    </span>
                  </p>
                </div>
              </div>
              <p className={`text-sm font-bold ${TYPE_COLORS[tx.type] ?? 'text-gray-900'}`}>
                {tx.type === 'sale' || tx.type === 'refund' ? '+' : '-'}{formatBRL(Math.abs(tx.amountBrl))}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
