'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiPost } from '@/lib/api';

function ConfirmarEmailInner() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') ?? '';

  const [state, setState] = useState<'idle' | 'working' | 'ok' | 'error'>('idle');
  const [message, setMessage] = useState<string>('');
  const [newEmail, setNewEmail] = useState<string>('');

  useEffect(() => {
    if (!token) {
      setState('error');
      setMessage('Link inválido: token ausente.');
      return;
    }
    setState('working');
    apiPost<{ success: boolean; message: string; newEmail: string }>(
      '/auth/confirm-email-change',
      { token },
    )
      .then((res) => {
        setState('ok');
        setMessage(res.message ?? 'Email alterado com sucesso.');
        setNewEmail(res.newEmail);
      })
      .catch((err: unknown) => {
        setState('error');
        const msg = err instanceof Error && err.message ? err.message : 'Link inválido ou expirado.';
        setMessage(msg);
      });
  }, [token]);

  return (
    <main className="max-w-md mx-auto mt-16 px-4">
      <div className="bg-white border border-gray-200 rounded-xl p-8">
        <h1 className="text-xl font-semibold text-gray-900 mb-3">Confirmação de email</h1>
        {state === 'working' && (
          <p className="text-sm text-gray-600">Processando a confirmação…</p>
        )}
        {state === 'ok' && (
          <>
            <p className="text-sm text-green-700 mb-2">{message}</p>
            {newEmail && (
              <p className="text-sm text-gray-600 mb-4">
                Seu novo email é <strong>{newEmail}</strong>. Faça login novamente para continuar.
              </p>
            )}
            <button
              type="button"
              onClick={() => router.push('/auth/login')}
              className="px-5 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700"
            >
              Ir para login
            </button>
          </>
        )}
        {state === 'error' && (
          <>
            <p className="text-sm text-red-700 mb-4">{message}</p>
            <button
              type="button"
              onClick={() => router.push('/conta/configuracoes')}
              className="px-5 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700"
            >
              Voltar para configurações
            </button>
          </>
        )}
      </div>
    </main>
  );
}

export default function ConfirmarEmailPage() {
  return (
    <Suspense fallback={<main className="max-w-md mx-auto mt-16 px-4"><p>Carregando…</p></main>}>
      <ConfirmarEmailInner />
    </Suspense>
  );
}
