'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [
  { href: '/conta/configuracoes', label: 'Configurações', icon: '⚙️' },
  { href: '/conta/verificacao', label: 'Verificação', icon: '🛡️' },
  { href: '/conta/payout-methods', label: 'Chaves PIX', icon: '💳' },
  { href: '/addresses', label: 'Endereços', icon: '📍' },
  { href: '/notifications', label: 'Notificações', icon: '🔔' },
  { href: '/conta/ajuda', label: 'Ajuda', icon: '❓' },
];

export default function ContaLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

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
