'use client';

import { useState, useEffect } from 'react';
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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

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

export default function WalletPage() {
  const router = useRouter();
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPayout, setShowPayout] = useState(false);
  const [pixKey, setPixKey] = useState('');
  const [pixKeyType, setPixKeyType] = useState<'cpf' | 'email' | 'phone' | 'random'>('cpf');
  const [payoutAmount, setPayoutAmount] = useState('');
  const [payoutLoading, setPayoutLoading] = useState(false);

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('vintage_token') : null;
    if (!token) {
      router.push('/auth/login');
      return;
    }

    Promise.all([
      apiGet<WalletBalance>('/wallet').catch(() => {
        setError('Não foi possível carregar os dados. Tente novamente.');
        return { availableBrl: 0, pendingBrl: 0, totalBrl: 0 };
      }),
      apiGet<{ items: WalletTransaction[] } | WalletTransaction[]>('/wallet/transactions').catch(() => {
        setError('Não foi possível carregar os dados. Tente novamente.');
        return [];
      }),
    ]).then(([bal, txns]) => {
      setBalance(bal);
      setTransactions(Array.isArray(txns) ? txns : (txns.items ?? []));
    }).finally(() => setLoading(false));
  }, [router]);

  const handlePayout = async () => {
    if (!pixKey.trim() || !payoutAmount.trim()) return;
    const amount = parseFloat(payoutAmount.replace(',', '.'));
    if (isNaN(amount) || amount <= 0) {
      alert('Valor invalido.');
      return;
    }
    if (balance && amount > balance.availableBrl) {
      alert('Saldo insuficiente.');
      return;
    }
    setPayoutLoading(true);
    try {
      await apiPost('/wallet/payout', { amountBrl: amount, pixKey: pixKey.trim(), pixKeyType });
      setShowPayout(false);
      setPixKey('');
      setPayoutAmount('');
      // Refresh data
      const [bal, txns] = await Promise.all([
        apiGet<WalletBalance>('/wallet').catch(() => balance),
        apiGet<{ items: WalletTransaction[] } | WalletTransaction[]>('/wallet/transactions').catch(() => transactions),
      ]);
      if (bal) setBalance(bal);
      setTransactions(Array.isArray(txns) ? txns : (txns.items ?? []));
    } catch {
      alert('Erro ao solicitar saque. Tente novamente.');
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
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Carteira</h1>

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
        onClick={() => setShowPayout(!showPayout)}
        className="mb-6 px-6 py-3 bg-brand-600 text-white rounded-xl font-medium hover:bg-brand-700 transition"
      >
        Sacar via PIX
      </button>

      {/* Payout form */}
      {showPayout && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-900">Solicitar saque</h2>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Tipo de chave PIX</label>
            <select
              value={pixKeyType}
              onChange={(e) => setPixKeyType(e.target.value as typeof pixKeyType)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
            >
              <option value="cpf">CPF</option>
              <option value="email">E-mail</option>
              <option value="phone">Telefone</option>
              <option value="random">Chave aleatoria</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Chave PIX</label>
            <input
              type="text"
              value={pixKey}
              onChange={(e) => setPixKey(e.target.value)}
              placeholder="Digite sua chave PIX"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
            />
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
