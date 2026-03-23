import Link from 'next/link';

export default function Header() {
  return (
    <header className="sticky top-0 z-50 bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="text-xl font-bold text-brand-600">
            Vintage.br
          </Link>

          <div className="hidden md:flex flex-1 max-w-lg mx-8">
            <div className="relative w-full">
              <input
                type="text"
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
            </div>
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
          </nav>
        </div>
      </div>
    </header>
  );
}
