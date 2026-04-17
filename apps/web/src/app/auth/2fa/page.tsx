'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiPost, setAuthToken } from '@/lib/api';

function TwoFaChallengeInner() {
  const router = useRouter();
  const params = useSearchParams();

  const tempToken = params.get('tempToken') ?? '';
  const method = (params.get('method') === 'SMS' ? 'SMS' : 'TOTP') as 'SMS' | 'TOTP';
  const phoneHint = params.get('phoneHint') ?? '';

  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  if (!tempToken) {
    return (
      <main className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="w-full max-w-md bg-white border border-gray-200 rounded-xl p-8 text-center">
          <p className="text-sm text-red-700 mb-4">Sessão expirada. Faça login novamente.</p>
          <button
            type="button"
            onClick={() => router.replace('/auth/login')}
            className="px-5 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700"
          >
            Ir para login
          </button>
        </div>
      </main>
    );
  }

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    if (code.length !== 6) {
      setError('O código deve ter 6 dígitos.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiPost<{ accessToken: string; refreshToken: string }>(
        '/auth/2fa/confirm-login',
        { tempToken, token: code },
      );
      setAuthToken(res.accessToken);
      router.push('/');
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Código inválido ou expirado.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    if (method !== 'SMS') return;
    setError('');
    setNotice('');
    setResending(true);
    try {
      const res = await apiPost<{ success: boolean; phoneHint: string }>(
        '/auth/2fa/sms/login-resend',
        { tempToken },
      );
      setNotice(`Novo código enviado para ${res.phoneHint}.`);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Não foi possível reenviar.');
    } finally {
      setResending(false);
    }
  };

  return (
    <main className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Verificação em 2 etapas
        </h1>
        <p className="text-sm text-gray-600 mb-6">
          {method === 'SMS'
            ? `Enviamos um código de 6 dígitos para ${phoneHint || 'seu telefone'}. Válido por 5 minutos.`
            : 'Abra seu app autenticador e digite o código de 6 dígitos atual.'}
        </p>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700" role="alert">
            {error}
          </div>
        )}
        {notice && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
            {notice}
          </div>
        )}

        <form onSubmit={handleConfirm} className="space-y-4">
          <input
            id="code"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="123456"
            autoFocus
            className="w-full px-4 py-3 text-2xl tracking-widest text-center border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-600"
            aria-label="Código de verificação"
          />
          <button
            type="submit"
            disabled={submitting || code.length !== 6}
            className="w-full py-3 bg-brand-600 text-white rounded-xl font-medium hover:bg-brand-700 transition disabled:opacity-40"
          >
            {submitting ? 'Verificando…' : 'Verificar'}
          </button>

          {method === 'SMS' && (
            <button
              type="button"
              onClick={handleResend}
              disabled={resending}
              className="w-full text-sm text-brand-600 font-medium hover:text-brand-700 disabled:opacity-40"
            >
              {resending ? 'Reenviando…' : 'Reenviar código'}
            </button>
          )}

          <button
            type="button"
            onClick={() => router.replace('/auth/login')}
            className="w-full text-sm text-gray-500 hover:text-gray-700"
          >
            Voltar ao login
          </button>
        </form>
      </div>
    </main>
  );
}

export default function TwoFaChallengePage() {
  return (
    <Suspense fallback={<main className="min-h-[60vh] flex items-center justify-center"><p>Carregando…</p></main>}>
      <TwoFaChallengeInner />
    </Suspense>
  );
}
