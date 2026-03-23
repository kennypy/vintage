'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { clearAuthToken } from '@/lib/api';

export default function Header() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('vintage_token');
    setIsAuthenticated(!!token);

    const handleStorage = () => {
      const t = localStorage.getItem('vintage_token');
      setIsAuthenticated(!!t);
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/listings?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const handleLogout = () => {
    clearAuthToken();
    setIsAuthenticated(false);
    router.push('/');
  };

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="text-xl font-bold text-brand-600">
            Vintage.br
          </Link>

          <div className="hidden md:flex flex-1 max-w-lg mx-8">
            <form onSubmit={handleSearch} className="relative w-full">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar roupas, marcas, estilos..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent"
              />
              <svg
                className="absolute left-3 top-2.5 h-4 w-4 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </form>
          </div>

          <nav className="flex items-center gap-2 sm:gap-4">
            <Link
              href="/listings"
              className="text-sm text-gray-700 hover:text-brand-600 transition"
            >
              Explorar
            </Link>
            <Link
              href="/sell"
              className="text-sm text-gray-700 hover:text-brand-600 transition"
            >
              Vender
            </Link>
            {isAuthenticated ? (
              <div className="hidden sm:flex items-center gap-2 ml-2">
                <Link
                  href="/profile"
                  className="text-sm px-4 py-2 text-brand-600 hover:bg-brand-50 rounded-lg transition"
                >
                  Meu perfil
                </Link>
                <button
                  onClick={handleLogout}
                  className="text-sm px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition"
                >
                  Sair
                </button>
              </div>
            ) : (
              <div className="hidden sm:flex items-center gap-2 ml-2">
                <Link
                  href="/auth/login"
                  className="text-sm px-4 py-2 text-brand-600 hover:bg-brand-50 rounded-lg transition"
                >
                  Entrar
                </Link>
                <Link
                  href="/auth/register"
                  className="text-sm px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition"
                >
                  Criar conta
                </Link>
              </div>
            )}
          </nav>
        </div>
      </div>
    </header>
  );
}
