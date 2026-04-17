import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="bg-gray-50 border-t border-gray-200 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            <Link href="/sobre" className="text-sm text-gray-500 hover:text-gray-700 transition">
              Sobre
            </Link>
            <Link href="/ajuda" className="text-sm text-gray-500 hover:text-gray-700 transition">
              Ajuda
            </Link>
            <Link href="/contato" className="text-sm text-gray-500 hover:text-gray-700 transition">
              Contato
            </Link>
            <Link
              href="/diretrizes-comunidade"
              className="text-sm text-gray-500 hover:text-gray-700 transition"
            >
              Diretrizes
            </Link>
            <Link href="/termos" className="text-sm text-gray-500 hover:text-gray-700 transition">
              Termos
            </Link>
            <Link
              href="/privacidade"
              className="text-sm text-gray-500 hover:text-gray-700 transition"
            >
              Privacidade
            </Link>
          </div>
          <p className="text-sm text-gray-400">&copy; 2026 Vintage.br</p>
        </div>
      </div>
    </footer>
  );
}
