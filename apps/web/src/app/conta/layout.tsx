'use client';

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

const NAV = [
  { href: '/conta/configuracoes', label: 'Configurações', icon: '⚙️' },
  { href: '/conta/cpf', label: 'CPF', icon: '🪪' },
  { href: '/conta/verificacao', label: 'Verificação', icon: '🛡️' },
  { href: '/conta/payout-methods', label: 'Chaves PIX', icon: '💳' },
  { href: '/conta/blocked-users', label: 'Usuários bloqueados', icon: '🚫' },
  { href: '/addresses', label: 'Endereços', icon: '📍' },
  { href: '/notifications', label: 'Notificações', icon: '🔔' },
  { href: '/conta/ajuda', label: 'Ajuda', icon: '❓' },
];

/**
 * Layout-level auth gate for every /conta/* page. Before Wave 3F each
 * page fetched /users/me independently and redirected to login on 401,
 * which produced a brief skeleton flicker before the redirect fired on
 * logged-out visits. Gating at the layout removes the flicker AND any
 * duplicated auth checks in every child page.
 *
 * Uses the token in localStorage as the presence check — the API would
 * still reject a stale/expired token via JwtStrategy, so a child page
 * can still receive a 401 on its own fetch. The layout only guards the
 * "no token at all" case to avoid rendering account-scoped chrome to
 * anonymous visitors.
 */
export default function ContaLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = typeof window !== 'undefined'
      ? window.localStorage.getItem('vintage_token')
      : null;
    if (!token) {
      router.replace('/auth/login');
      return;
    }
    setReady(true);
  }, [router]);

  if (!ready) {
    // Tiny placeholder while the auth check resolves. Prevents the
    // flicker of nav + child skeleton before the redirect.
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="h-8 w-40 bg-gray-200 rounded animate-pulse mb-6" />
        <div className="h-64 bg-white border border-gray-100 rounded-xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Minha conta</h1>
      <div className="flex flex-col sm:flex-row gap-6">
        <nav className="sm:w-56 flex-shrink-0">
          <ul className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            {NAV.map((item) => {
              const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`flex items-center gap-3 px-4 py-3 text-sm border-b border-gray-100 last:border-0 transition ${
                      active
                        ? 'bg-brand-50 text-brand-700 font-medium'
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <span aria-hidden>{item.icon}</span>
                    <span>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}
