import Link from 'next/link';

export default function AboutPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Sobre a Vintage.br</h1>

      <div className="prose prose-gray max-w-none space-y-6">
        <p className="text-lg text-gray-600 leading-relaxed">
          A Vintage.br e o maior marketplace de moda de segunda mao do Brasil. Conectamos
          vendedores e compradores apaixonados por moda sustentavel, oferecendo uma plataforma
          segura e facil de usar para comprar e vender roupas, sapatos e acessorios.
        </p>

        <h2 className="text-xl font-semibold text-gray-900 mt-8">Nossa missao</h2>
        <p className="text-gray-600 leading-relaxed">
          Acreditamos que a moda pode ser acessivel, sustentavel e divertida. Cada peca comprada
          na Vintage.br e uma peca a menos no aterro sanitario e uma oportunidade de dar vida
          nova a roupas incriveis.
        </p>

        <h2 className="text-xl font-semibold text-gray-900 mt-8">Como funciona</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-4">
          <div className="bg-brand-50 rounded-xl p-6 text-center">
            <div className="w-12 h-12 bg-brand-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <h3 className="font-medium text-gray-900">1. Fotografe</h3>
            <p className="text-sm text-gray-500 mt-1">Tire fotos das suas pecas e crie um anuncio em minutos.</p>
          </div>
          <div className="bg-brand-50 rounded-xl p-6 text-center">
            <div className="w-12 h-12 bg-brand-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <h3 className="font-medium text-gray-900">2. Venda</h3>
            <p className="text-sm text-gray-500 mt-1">Receba ofertas, negocie e venda com seguranca via PIX.</p>
          </div>
          <div className="bg-brand-50 rounded-xl p-6 text-center">
            <div className="w-12 h-12 bg-brand-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            <h3 className="font-medium text-gray-900">3. Envie</h3>
            <p className="text-sm text-gray-500 mt-1">Envie pelos Correios ou Jadlog com etiqueta pre-paga.</p>
          </div>
        </div>

        <h2 className="text-xl font-semibold text-gray-900 mt-8">Protecao ao comprador</h2>
        <p className="text-gray-600 leading-relaxed">
          Todas as compras na Vintage.br contam com protecao total. Se o item nao corresponder
          ao anuncio, voce recebe seu dinheiro de volta. Simples assim.
        </p>

        <div className="mt-8 flex flex-col sm:flex-row gap-4">
          <Link href="/listings" className="inline-block px-6 py-3 bg-brand-600 text-white rounded-xl font-medium hover:bg-brand-700 transition text-center">
            Explorar pecas
          </Link>
          <Link href="/sell" className="inline-block px-6 py-3 border-2 border-brand-600 text-brand-600 rounded-xl font-medium hover:bg-brand-50 transition text-center">
            Comecar a vender
          </Link>
        </div>
      </div>
    </div>
  );
}
