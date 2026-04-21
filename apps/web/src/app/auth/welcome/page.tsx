'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

/**
 * Post-signup walkthrough — first page after successful registration.
 * Mirrors /welcome/verify on mobile. Primary CTA → /conta/verificacao
 * to complete Serpro CPF verification; secondary CTA skips straight
 * to the home feed (banner + cron keep nudging unverified users).
 */
export default function WelcomeVerifyPage() {
  const router = useRouter();

  return (
    <main className="mx-auto max-w-xl px-6 py-12">
      <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-brand-600">
        <svg className="h-10 w-10 text-white" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
        </svg>
      </div>

      <h1 className="text-center text-3xl font-bold text-gray-900">
        Bem-vindo(a) ao Vintage.br!
      </h1>
      <p className="mt-2 text-center text-gray-600">
        Ganhe o selo <strong className="text-gray-900">CPF Verificado</strong> e comece com o pé direito.
      </p>

      <ul className="mt-8 space-y-3">
        {[
          ['🏪', 'Necessário para publicar anúncios e vender'],
          ['💰', 'Libera saques via PIX para sua conta'],
          ['🏅', 'Aumenta a confiança dos compradores no seu perfil'],
          ['⚡', 'Verificação em menos de 1 minuto'],
        ].map(([emoji, text]) => (
          <li key={text} className="flex items-center gap-3 rounded-xl bg-white p-4 shadow-sm">
            <span className="text-2xl" aria-hidden>{emoji}</span>
            <span className="text-sm text-gray-800">{text}</span>
          </li>
        ))}
      </ul>

      <Link
        href="/conta/verificacao"
        className="mt-8 block w-full rounded-xl bg-brand-600 py-4 text-center font-bold text-white hover:bg-brand-700"
      >
        Verificar CPF agora
      </Link>

      <button
        type="button"
        onClick={() => router.replace('/')}
        className="mt-3 w-full rounded-xl py-3 text-center font-semibold text-gray-700 hover:bg-gray-100"
      >
        Explorar primeiro
      </button>

      <p className="mt-6 text-center text-xs text-gray-500">
        Você pode verificar depois em Conta → Verificação. A qualquer momento.
      </p>
    </main>
  );
}
