'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api';

type PixKeyType = 'PIX_CPF' | 'PIX_CNPJ' | 'PIX_EMAIL' | 'PIX_PHONE' | 'PIX_RANDOM';

interface PayoutMethodView {
  id: string;
  type: PixKeyType;
  pixKeyMasked: string;
  label: string | null;
  isDefault: boolean;
  createdAt: string;
}

const TYPE_LABELS: Record<PixKeyType, string> = {
  PIX_CPF: 'CPF',
  PIX_CNPJ: 'CNPJ',
  PIX_EMAIL: 'E-mail',
  PIX_PHONE: 'Telefone',
  PIX_RANDOM: 'Chave aleatória',
};

const TYPE_PLACEHOLDERS: Record<PixKeyType, string> = {
  PIX_CPF: '000.000.000-00',
  PIX_CNPJ: '00.000.000/0000-00',
  PIX_EMAIL: 'seu@email.com',
  PIX_PHONE: '+5511999998888',
  PIX_RANDOM: 'xxxxxxxx-xxxx-4xxx-xxxx-xxxxxxxxxxxx',
};

export default function PayoutMethodsPage() {
  const router = useRouter();
  const [methods, setMethods] = useState<PayoutMethodView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [newType, setNewType] = useState<PixKeyType>('PIX_EMAIL');
  const [newKey, setNewKey] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newIsDefault, setNewIsDefault] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const data = await apiGet<PayoutMethodView[]>('/wallet/payout-methods');
      setMethods(data);
    } catch {
      router.push('/auth/login');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { void refresh(); }, [refresh]);

  const resetForm = () => {
    setShowForm(false);
    setNewType('PIX_EMAIL');
    setNewKey('');
    setNewLabel('');
    setNewIsDefault(false);
    setError(null);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!newKey.trim()) {
      setError('Informe a chave PIX.');
      return;
    }
    setSubmitting(true);
    try {
      await apiPost('/wallet/payout-methods', {
        type: newType,
        pixKey: newKey,
        label: newLabel.trim() || undefined,
        isDefault: newIsDefault,
      });
      resetForm();
      await refresh();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Não foi possível cadastrar.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      await apiPatch(`/wallet/payout-methods/${id}/default`, {});
      await refresh();
    } catch {
      setError('Erro ao atualizar padrão.');
    }
  };

  const handleDelete = async (id: string) => {
    if (typeof window !== 'undefined' && !window.confirm('Remover esta chave PIX?')) return;
    try {
      await apiDelete(`/wallet/payout-methods/${id}`);
      await refresh();
    } catch {
      setError('Erro ao remover chave.');
    }
  };

  if (loading) {
    return <div className="animate-pulse h-64 bg-white border border-gray-200 rounded-xl" />;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-base font-semibold text-gray-900 mb-1">Chaves PIX</h1>
        <p className="text-sm text-gray-500">
          Suas chaves PIX para receber o saldo de vendas. Usamos apenas chaves salvas — nunca
          pedimos a chave a cada saque.
        </p>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700" role="alert">
          {error}
        </div>
      )}

      {methods.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
          <p className="text-sm text-gray-700 mb-1">Nenhuma chave cadastrada</p>
          <p className="text-xs text-gray-500">Cadastre uma chave para poder solicitar saques.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {methods.map((m) => (
            <li
              key={m.id}
              className="bg-white border border-gray-200 rounded-xl p-4 flex flex-wrap items-center gap-3 justify-between"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase text-gray-500">
                    {TYPE_LABELS[m.type]}
                  </span>
                  {m.isDefault && (
                    <span className="text-xs font-semibold text-green-700 bg-green-50 px-2 py-0.5 rounded">
                      Padrão
                    </span>
                  )}
                </div>
                {m.label && <p className="text-sm text-gray-900 font-medium mt-1">{m.label}</p>}
                <p className="text-sm font-mono text-gray-700 mt-1 truncate">{m.pixKeyMasked}</p>
              </div>
              <div className="flex gap-3 text-sm">
                {!m.isDefault && (
                  <button
                    type="button"
                    onClick={() => handleSetDefault(m.id)}
                    className="text-brand-600 hover:text-brand-700 font-medium"
                  >
                    Tornar padrão
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleDelete(m.id)}
                  className="text-red-600 hover:text-red-700 font-medium"
                >
                  Remover
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {!showForm ? (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="w-full sm:w-auto px-5 py-2.5 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700"
        >
          Cadastrar chave PIX
        </button>
      ) : (
        <form onSubmit={handleAdd} className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
          <h2 className="text-base font-semibold text-gray-900">Cadastrar chave PIX</h2>

          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase mb-2">Tipo</label>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(TYPE_LABELS) as PixKeyType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setNewType(t)}
                  className={`px-3 py-1.5 text-sm rounded-full border ${
                    newType === t
                      ? 'border-brand-500 bg-brand-50 text-brand-700 font-semibold'
                      : 'border-gray-300 text-gray-600 hover:border-gray-400'
                  }`}
                >
                  {TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="pix-key" className="block text-xs font-semibold text-gray-600 uppercase mb-2">
              Chave
            </label>
            <input
              id="pix-key"
              type="text"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder={TYPE_PLACEHOLDERS[newType]}
              autoComplete="off"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div>
            <label htmlFor="pix-label" className="block text-xs font-semibold text-gray-600 uppercase mb-2">
              Apelido (opcional)
            </label>
            <input
              id="pix-label"
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              maxLength={80}
              placeholder="Conta principal"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={newIsDefault}
              onChange={(e) => setNewIsDefault(e.target.checked)}
              className="rounded text-brand-600"
            />
            Usar como padrão nos saques
          </label>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50"
            >
              {submitting ? 'Cadastrando...' : 'Cadastrar'}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="px-5 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
