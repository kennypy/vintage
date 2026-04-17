'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiPost } from '@/lib/api';

export default function AlterarEmailPage() {
  const router = useRouter();
  const [newEmail, setNewEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);
    const email = newEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setNotice({ type: 'error', msg: 'Informe um email válido.' });
      return;
    }
    if (!password) {
      setNotice({ type: 'error', msg: 'Informe sua senha atual.' });
      return;
    }
    setLoading(true);
    try {
      const res = await apiPost<{ success: boolean; message: string }>(
        '/auth/request-email-change',
        { newEmail: email, password },
      );
      setNotice({ type: 'success', msg: res.message ?? `Enviamos um link para ${email}.` });
      setNewEmail('');
      setPassword('');
    } catch (err: unknown) {
      const msg = err instanceof Error && err.message ? err.message : 'Não foi possível iniciar a alteração.';
      setNotice({ type: 'error', msg });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <section className="bg-white border border-gray-200 rounded-xl p-6">
        <h1 className="text-base font-semibold text-gray-900 mb-1">Alterar email</h1>
        <p className="text-sm text-gray-500 mb-4">
          Enviaremos um link de confirmação para o novo endereço. Seu email atual continua válido
          até você clicar no link.
        </p>

        {notice && (
          <div
            className={`p-3 rounded-xl text-sm border mb-4 ${
              notice.type === 'success'
                ? 'bg-green-50 border-green-200 text-green-700'
                : 'bg-red-50 border-red-200 text-red-700'
            }`}
          >
            {notice.msg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label htmlFor="newEmail" className="block text-sm font-medium text-gray-700 mb-1">
              Novo email
            </label>
            <input
              id="newEmail"
              type="email"
              autoComplete="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="voce@exemplo.com"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              Senha atual
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={loading || !newEmail || !password}
              className="px-5 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-40"
            >
              {loading ? 'Enviando…' : 'Enviar link'}
            </button>
            <button
              type="button"
              onClick={() => router.push('/conta/configuracoes')}
              className="px-5 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50"
            >
              Cancelar
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
