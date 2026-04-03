'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { clearAuthToken } from '@/lib/api';

export default function Header() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
              <>
                <div className="hidden sm:flex items-center gap-1 ml-2">
                  <Link
                    href="/favorites"
                    className="p-2 text-gray-500 hover:text-brand-600 rounded-lg transition"
                    title="Favoritos"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                    </svg>
                  </Link>
                  <Link
                    href="/messages"
                    className="p-2 text-gray-500 hover:text-brand-600 rounded-lg transition"
                    title="Mensagens"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                  </Link>
                  <Link
                    href="/notifications"
                    className="p-2 text-gray-500 hover:text-brand-600 rounded-lg transition"
                    title="Notificacoes"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                  </Link>
                  <Link
                    href="/orders"
                    className="p-2 text-gray-500 hover:text-brand-600 rounded-lg transition"
                    title="Pedidos"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                    </svg>
                  </Link>
                  <Link
                    href="/profile"
                    className="text-sm px-3 py-2 text-brand-600 hover:bg-brand-50 rounded-lg transition"
                  >
                    Meu perfil
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="text-sm px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition"
                  >
                    Sair
                  </button>
                </div>
                {/* Mobile hamburger for authenticated */}
                <button
                  className="sm:hidden p-2 text-gray-500"
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={mobileMenuOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
                  </svg>
                </button>
              </>
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

      {/* Mobile menu */}
      {mobileMenuOpen && isAuthenticated && (
        <div className="sm:hidden border-t border-gray-200 bg-white px-4 py-3 space-y-1">
          <Link href="/favorites" className="block px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-lg" onClick={() => setMobileMenuOpen(false)}>Favoritos</Link>
          <Link href="/messages" className="block px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-lg" onClick={() => setMobileMenuOpen(false)}>Mensagens</Link>
          <Link href="/notifications" className="block px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-lg" onClick={() => setMobileMenuOpen(false)}>Notificacoes</Link>
          <Link href="/orders" className="block px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-lg" onClick={() => setMobileMenuOpen(false)}>Pedidos</Link>
          <Link href="/my-listings" className="block px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-lg" onClick={() => setMobileMenuOpen(false)}>Meus anuncios</Link>
          <Link href="/wallet" className="block px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-lg" onClick={() => setMobileMenuOpen(false)}>Carteira</Link>
          <Link href="/offers" className="block px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-lg" onClick={() => setMobileMenuOpen(false)}>Ofertas</Link>
          <Link href="/profile" className="block px-3 py-2 text-sm text-brand-600 hover:bg-brand-50 rounded-lg" onClick={() => setMobileMenuOpen(false)}>Meu perfil</Link>
          <button onClick={() => { handleLogout(); setMobileMenuOpen(false); }} className="block w-full text-left px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Sair</button>
        </div>
      )}
    </header>
  );
}
