'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api';
import { formatCEP } from '@/lib/i18n';

interface Address {
  id: string;
  label: string;
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
  cep: string;
  isDefault: boolean;
}

type AddressDraft = Omit<Address, 'id' | 'isDefault'>;

const EMPTY_DRAFT: AddressDraft = {
  label: '',
  street: '',
  number: '',
  complement: '',
  neighborhood: '',
  city: '',
  state: '',
  cep: '',
};

const BR_STATES = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
  'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
  'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];

interface ViaCEPResponse {
  logradouro?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  erro?: boolean;
}

export default function AddressesPage() {
  const router = useRouter();
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [draft, setDraft] = useState<AddressDraft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);
  const [cepError, setCepError] = useState<string | null>(null);

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('vintage_token') : null;
    if (!token) {
      router.push('/auth/login');
      return;
    }
    apiGet<Address[] | { items: Address[]; data: Address[] }>('/users/me/addresses')
      .then((res) => {
        const list = Array.isArray(res) ? res : (res.items ?? res.data ?? []);
        setAddresses(list);
      })
      .catch(() => {
        setAddresses([]);
        setError('Não foi possível carregar seus endereços.');
      })
      .finally(() => setLoading(false));
  }, [router]);

  const resetForm = () => {
    setDraft(EMPTY_DRAFT);
    setEditingId(null);
    setCepError(null);
  };

  const startEditing = (addr: Address) => {
    setDraft({
      label: addr.label,
      street: addr.street,
      number: addr.number,
      complement: addr.complement ?? '',
      neighborhood: addr.neighborhood,
      city: addr.city,
      state: addr.state,
      cep: formatCEP(addr.cep),
    });
    setEditingId(addr.id);
    setFormOpen(true);
  };

  const lookupCEP = async (rawCep: string) => {
    const digits = rawCep.replace(/\D/g, '');
    if (digits.length !== 8) return;
    setCepLoading(true);
    setCepError(null);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      if (!res.ok) throw new Error('CEP lookup failed');
      const data = (await res.json()) as ViaCEPResponse;
      if (data.erro) {
        setCepError('CEP não encontrado.');
        return;
      }
      setDraft((prev) => ({
        ...prev,
        street: prev.street || (data.logradouro ?? ''),
        neighborhood: prev.neighborhood || (data.bairro ?? ''),
        city: prev.city || (data.localidade ?? ''),
        state: prev.state || (data.uf ?? ''),
      }));
    } catch {
      setCepError('Não foi possível consultar o CEP.');
    } finally {
      setCepLoading(false);
    }
  };

  const handleSave = async () => {
    // Minimal validation — empty required fields abort silently.
    if (!draft.label || !draft.cep || !draft.street || !draft.number || !draft.city || !draft.state) {
      setError('Preencha todos os campos obrigatórios.');
      return;
    }
    setSaving(true);
    setError(null);
    const payload = { ...draft, cep: draft.cep.replace(/\D/g, '') };
    try {
      if (editingId) {
        const updated = await apiPatch<Address>(
          `/users/me/addresses/${encodeURIComponent(editingId)}`,
          payload,
        );
        setAddresses((prev) => prev.map((a) => (a.id === editingId ? updated : a)));
      } else {
        const created = await apiPost<Address>('/users/me/addresses', {
          ...payload,
          isDefault: addresses.length === 0,
        });
        setAddresses((prev) => [...prev, created]);
      }
      setFormOpen(false);
      resetForm();
    } catch {
      setError('Não foi possível salvar o endereço. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja remover este endereço?')) return;
    try {
      await apiDelete(`/users/me/addresses/${encodeURIComponent(id)}`);
      setAddresses((prev) => prev.filter((a) => a.id !== id));
    } catch {
      setError('Não foi possível remover o endereço.');
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      await apiPatch(`/users/me/addresses/${encodeURIComponent(id)}`, { isDefault: true });
      setAddresses((prev) => prev.map((a) => ({ ...a, isDefault: a.id === id })));
    } catch {
      setError('Não foi possível definir este endereço como padrão.');
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Endereços</h1>
        {!formOpen && (
          <button
            type="button"
            onClick={() => {
              resetForm();
              setFormOpen(true);
            }}
            className="px-4 py-2 bg-brand-600 text-white rounded-xl text-sm font-medium hover:bg-brand-700 transition"
          >
            Novo endereço
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700" role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="animate-pulse bg-white border border-gray-200 rounded-xl p-4 h-24" />
          ))}
        </div>
      ) : addresses.length === 0 && !formOpen ? (
        <div className="text-center py-16 bg-white border border-gray-200 rounded-xl">
          <p className="text-gray-500 mb-4">Você ainda não cadastrou um endereço de entrega.</p>
          <button
            type="button"
            onClick={() => {
              resetForm();
              setFormOpen(true);
            }}
            className="inline-block px-6 py-2 bg-brand-600 text-white rounded-xl text-sm font-medium hover:bg-brand-700 transition"
          >
            Adicionar endereço
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {addresses.map((addr) => (
            <div key={addr.id} className="flex items-start justify-between p-4 bg-white border border-gray-200 rounded-xl gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-sm font-medium text-gray-900">{addr.label}</p>
                  {addr.isDefault && (
                    <span className="text-xs text-brand-600 bg-brand-50 px-2 py-0.5 rounded-full font-medium">Padrão</span>
                  )}
                </div>
                <p className="text-xs text-gray-600">
                  {addr.street}, {addr.number}
                  {addr.complement ? ` — ${addr.complement}` : ''}
                </p>
                <p className="text-xs text-gray-600">
                  {addr.neighborhood}, {addr.city} — {addr.state}
                </p>
                <p className="text-xs text-gray-500">CEP: {formatCEP(addr.cep)}</p>
              </div>
              <div className="flex flex-col gap-1 items-end flex-shrink-0">
                {!addr.isDefault && (
                  <button
                    type="button"
                    onClick={() => handleSetDefault(addr.id)}
                    className="text-xs text-brand-600 hover:text-brand-700 font-medium"
                  >
                    Definir padrão
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => startEditing(addr)}
                  className="text-xs text-gray-600 hover:text-gray-900 font-medium"
                >
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(addr.id)}
                  className="text-xs text-red-600 hover:text-red-700 font-medium"
                >
                  Remover
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {formOpen && (
        <div className="mt-6 bg-white border border-gray-200 rounded-xl p-6 space-y-4">
          <h2 className="text-base font-semibold text-gray-900">
            {editingId ? 'Editar endereço' : 'Novo endereço'}
          </h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Identificação</label>
            <input
              value={draft.label}
              onChange={(e) => setDraft((p) => ({ ...p, label: e.target.value }))}
              placeholder="Ex: Casa, Trabalho"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">CEP</label>
            <input
              value={draft.cep}
              onChange={(e) => setDraft((p) => ({ ...p, cep: formatCEP(e.target.value) }))}
              onBlur={(e) => lookupCEP(e.target.value)}
              placeholder="00000-000"
              maxLength={9}
              inputMode="numeric"
              className="w-full sm:w-40 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            {cepLoading && <p className="text-xs text-gray-400 mt-1">Consultando CEP…</p>}
            {cepError && <p className="text-xs text-red-500 mt-1">{cepError}</p>}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Rua / Avenida</label>
              <input
                value={draft.street}
                onChange={(e) => setDraft((p) => ({ ...p, street: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Número</label>
              <input
                value={draft.number}
                onChange={(e) => setDraft((p) => ({ ...p, number: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Complemento</label>
            <input
              value={draft.complement ?? ''}
              onChange={(e) => setDraft((p) => ({ ...p, complement: e.target.value }))}
              placeholder="Apto, bloco, ponto de referência…"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Bairro</label>
            <input
              value={draft.neighborhood}
              onChange={(e) => setDraft((p) => ({ ...p, neighborhood: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Cidade</label>
              <input
                value={draft.city}
                onChange={(e) => setDraft((p) => ({ ...p, city: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
              <select
                value={draft.state}
                onChange={(e) => setDraft((p) => ({ ...p, state: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
              >
                <option value="">UF</option>
                {BR_STATES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex-1 py-2.5 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition disabled:opacity-50"
            >
              {saving ? 'Salvando…' : 'Salvar endereço'}
            </button>
            <button
              type="button"
              onClick={() => {
                setFormOpen(false);
                resetForm();
              }}
              className="flex-1 py-2.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
