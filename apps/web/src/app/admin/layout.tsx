'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const NAV_ITEMS = [
  { href: '/admin', label: 'Painel', icon: '~' },
  { href: '/admin/moderation', label: 'Moderação', icon: '~' },
  { href: '/admin/features', label: 'Feature Toggles', icon: '~' },
  { href: '/admin/users', label: 'Usuarios', icon: '~' },
  { href: '/admin/analytics', label: 'Vendas & Analytics', icon: '~' },
];

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const base64 = token.split('.')[1];
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('vintage_token');
    if (!token) {
      router.replace('/auth/login');
      return;
    }
    const payload = decodeJwtPayload(token);
    if (!payload || payload.role !== 'ADMIN') {
      // Try fetching user profile to check role
      fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1'}/users/me`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
        .then((res) => res.json())
        .then((data: { role?: string }) => {
          if (data.role === 'ADMIN') {
            setAuthorized(true);
          } else {
            router.replace('/');
          }
        })
        .catch(() => router.replace('/auth/login'));
      return;
    }
    setAuthorized(true);
  }, [router]);

  if (!authorized) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-gray-500">Verificando permissoes...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-120px)]">
      {/* Mobile sidebar toggle */}
      <button
        className="md:hidden fixed top-20 left-4 z-50 bg-purple-600 text-white p-2 rounded-lg"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        aria-label="Toggle menu"
      >
        {sidebarOpen ? 'X' : '='}
      </button>

      {/* Sidebar */}
      <aside
        className={`
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          md:translate-x-0 transition-transform duration-200
          fixed md:static z-40 w-64 bg-gray-900 text-white min-h-full
        `}
      >
        <div className="p-6">
          <h2 className="text-lg font-bold text-purple-400 mb-1">Admin</h2>
          <p className="text-xs text-gray-400 mb-6">Vintage.br</p>
          <nav className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`
                    block px-4 py-2.5 rounded-lg text-sm font-medium transition-colors
                    ${active ? 'bg-purple-600 text-white' : 'text-gray-300 hover:bg-gray-800 hover:text-white'}
                  `}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </aside>

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <div className="flex-1 p-6 md:p-8 bg-gray-50 min-h-full">
        {children}
      </div>
    </div>
  );
}
