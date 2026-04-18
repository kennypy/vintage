'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiGet, apiPost } from '@/lib/api';

interface MeResponse {
  id: string;
  cpf: string | null;
  cpfVerified: boolean;
  socialProvider: string | null;
}

function formatCpfInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 11);
  const parts = [
    digits.slice(0, 3),
    digits.slice(3, 6),
    digits.slice(6, 9),
    digits.slice(9, 11),
  ].filter(Boolean);
  if (parts.length <= 3) return parts.join('.');
  return `${parts.slice(0, 3).join('.')}-${parts[3]}`;
}

function maskCpf(cpf: string): string {
  const digits = cpf.replace(/\D/g, '');
  if (digits.length !== 11) return '•••';
  return `•••.•••.•••-${digits.slice(-2)}`;
}

export default function CpfPage() {
  const router = useRouter();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [input, setInput] = useState('');
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const refresh = async () => {
    try {
      const data = await apiGet<MeResponse>('/users/me');
      setMe(data);
    } catch {
      router.push('/auth/login');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // refresh is stable within this component (captures only setState +
    // router), and the effect should only run once on mount.
  }, []);

  useEffect(() => {
    if (!notice || notice.type !== 'success') return;
    const t = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(t);
  }, [notice]);

  const digits = input.replace(/\D/g, '');
  const canSubmit = digits.length === 11 && !submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);
    if (digits.length !== 11) {
      setNotice({ type: 'error', msg: 'Informe os 11 dígitos do CPF.' });
      return;
    }
    setSubmitting(true);
    try {
      await apiPost('/users/me/cpf', { cpf: input });
      await refresh();
      setInput('');
      setNotice({ type: 'success', msg: 'CPF cadastrado com sucesso.' });
    } catch (err) {
      setNotice({
        type: 'error',
        msg: err instanceof Error && err.message
          ? err.message
          : 'Não foi possível cadastrar o CPF. Tente novamente.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="animate-pulse h-64 bg-white border border-gray-200 rounded-xl" />;
  }
  if (!me) return null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-base font-semibold text-gray-900 mb-1">CPF</h1>
        <p className="text-sm text-gray-500">
          Seu CPF é necessário para receber repasses via PIX e emitir notas fiscais.
          Ele é armazenado com segurança e nunca aparece no seu perfil público.
        </p>
      </div>

      {notice && (
        <div
          className={`p-3 rounded-xl text-sm border ${
            notice.type === 'success'
              ? 'bg-green-50 border-green-200 text-green-700'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}
          role={notice.type === 'error' ? 'alert' : 'status'}
        >
          {notice.msg}
        </div>
      )}

      {me.cpf ? (
        <section className="bg-white border border-gray-200 rounded-xl p-6 space-y-3">
          <div className="flex items-center gap-2">
            <svg
              className={`w-5 h-5 ${me.cpfVerified ? 'text-green-600' : 'text-yellow-600'}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <h2 className="text-sm font-semibold text-gray-900">
              {me.cpfVerified ? 'CPF verificado' : 'CPF cadastrado (não verificado)'}
            </h2>
          </div>
          <p className="text-xl font-mono tracking-wide text-gray-900">
            {maskCpf(me.cpf)}
          </p>
          <p className="text-sm text-gray-500">
            O CPF não pode ser alterado diretamente. Se houver um erro no cadastro,
            entre em contato com o suporte.
          </p>
          {!me.cpfVerified && (
            <button
              type="button"
              onClick={() => router.push('/conta/verificacao')}
              className="inline-block px-5 py-2 border border-brand-500 text-brand-600 text-sm font-medium rounded-lg hover:bg-brand-50"
            >
              Verificar CPF na Receita Federal
            </button>
          )}
        </section>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="bg-white border border-gray-200 rounded-xl p-6 space-y-4"
        >
          <h2 className="text-sm font-semibold text-gray-900">Adicionar CPF</h2>

          <div>
            <label htmlFor="cpf-input" className="block text-xs font-semibold text-gray-600 uppercase mb-2">
              CPF
            </label>
            <input
              id="cpf-input"
              type="text"
              inputMode="numeric"
              value={input}
              onChange={(e) => setInput(formatCpfInput(e.target.value))}
              placeholder="000.000.000-00"
              maxLength={14}
              autoFocus
              className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-lg font-mono tracking-wide focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <p className="text-xs text-gray-500">
            Atenção: uma vez cadastrado, o CPF não pode ser alterado por esta tela.
          </p>

          <button
            type="submit"
            disabled={!canSubmit}
            className="px-5 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-40"
          >
            {submitting ? 'Cadastrando...' : 'Cadastrar CPF'}
          </button>
        </form>
      )}
    </div>
  );
}
