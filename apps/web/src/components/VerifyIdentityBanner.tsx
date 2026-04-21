'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiGet } from '@/lib/api';

interface Me {
  id: string;
  cpfIdentityVerified?: boolean;
}

/**
 * Persistent banner at the top of authenticated pages prompting
 * unverified users to complete CPF identity verification. Dismiss is
 * in-memory only — the cron still sends scheduled email/push reminders,
 * and the banner re-appears on next page load. Hidden for anonymous
 * visitors (nothing to verify yet) and for already-verified users.
 */
export function VerifyIdentityBanner() {
  const [verified, setVerified] = useState<boolean | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const hasSession =
      typeof window !== 'undefined' && !!localStorage.getItem('vintage_token');
    if (!hasSession) return;
    apiGet<Me>('/users/me')
      .then((u) => setVerified(u.cpfIdentityVerified ?? false))
      .catch(() => setVerified(null));
  }, []);

  if (verified === null || verified === true || dismissed) return null;

  return (
    <div className="bg-brand-600 text-white">
      <div className="mx-auto max-w-7xl flex items-center gap-3 px-4 py-2 text-sm">
        <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
        </svg>
        <span className="flex-1">
          <strong>Verifique seu CPF</strong> para ganhar o selo Vintage.br Verificado e começar a vender.
        </span>
        <Link
          href="/conta/verificacao"
          className="bg-white text-brand-700 font-bold px-3 py-1 rounded-md text-xs hover:bg-gray-100"
        >
          Verificar
        </Link>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="text-white/80 hover:text-white px-2"
          aria-label="Dispensar"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
