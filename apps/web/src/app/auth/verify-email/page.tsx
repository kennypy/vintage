'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { apiPost } from '@/lib/api';

function VerifyEmailInner() {
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const [status, setStatus] = useState<'pending' | 'ok' | 'error'>('pending');
  const [message, setMessage] = useState<string>('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('Token ausente. Verifique o link no seu email.');
      return;
    }
    (async () => {
      try {
        await apiPost<{ success: true; email: string }>('/auth/verify-email', {
          token,
        });
        setStatus('ok');
      } catch (err) {
        setStatus('error');
        setMessage(
          err instanceof Error
            ? err.message
            : 'Não foi possível confirmar o email. O link pode ter expirado.',
        );
      }
    })();
  }, [token]);

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        {status === 'pending' && (
          <>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Confirmando seu email…
            </h1>
            <p className="text-sm text-gray-500">
              Estamos verificando o link. Só um instante.
            </p>
          </>
        )}
        {status === 'ok' && (
          <>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Email confirmado!
            </h1>
            <p className="text-sm text-gray-500 mb-6">
              Agora você pode entrar na sua conta Vintage.br.
            </p>
            <Link
              href="/auth/login"
              className="inline-block py-3 px-6 bg-brand-600 text-white rounded-xl font-medium hover:bg-brand-700 transition"
            >
              Entrar
            </Link>
          </>
        )}
        {status === 'error' && (
          <>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Não foi possível confirmar
            </h1>
            <p className="text-sm text-gray-600 mb-6" role="alert">
              {message}
            </p>
            <Link
              href="/auth/login"
              className="inline-block py-3 px-6 bg-brand-600 text-white rounded-xl font-medium hover:bg-brand-700 transition"
            >
              Voltar para login
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  // useSearchParams() requires a Suspense boundary under App Router.
  return (
    <Suspense fallback={<div className="min-h-[80vh]" />}>
      <VerifyEmailInner />
    </Suspense>
  );
}
