'use client';

import { useState } from 'react';
import Link from 'next/link';
import { apiPost } from '@/lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await apiPost('/auth/forgot-password', { email: email.trim().toLowerCase() });
    } catch {
      // Server returns neutral response; treat any error the same way
    } finally {
      setSent(true);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-bold text-gray-900 text-center mb-2">Esqueceu a senha?</h1>

        {!sent ? (
          <>
            <p className="text-sm text-gray-600 text-center mb-6">
              Informe seu email cadastrado e enviaremos um link para criar uma nova senha.
            </p>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  required
                  autoComplete="email"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-brand-600 text-white rounded-xl font-medium hover:bg-brand-700 transition disabled:opacity-50"
              >
                {loading ? 'Enviando...' : 'Enviar link'}
              </button>
            </form>
          </>
        ) : (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-800">
            Se este email estiver cadastrado, você receberá em alguns minutos instruções para redefinir sua senha.
            Lembre-se de verificar a caixa de spam.
          </div>
        )}

        <p className="text-sm text-gray-500 text-center mt-6">
          Lembrou a senha?{' '}
          <Link href="/auth/login" className="text-brand-600 hover:text-brand-700 font-medium">
            Voltar ao login
          </Link>
        </p>
      </div>
    </div>
  );
}
