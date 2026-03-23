import Link from 'next/link';

interface ListingData {
  id: string;
  title: string;
  price: number;
  condition: string;
  size: string;
  brand: string;
  color: string;
  description: string;
  sellerName: string;
  sellerRating: number;
  sellerReviews: number;
  shippingEstimate: string;
}

const mockListings: Record<string, ListingData> = {
  '1': {
    id: '1',
    title: 'Vestido Midi Farm',
    price: 89.9,
    condition: 'Bom',
    size: 'M',
    brand: 'Farm',
    color: 'Estampado',
    description: 'Vestido midi da Farm com estampa floral. Usado poucas vezes, em ótimo estado. Tecido leve e confortável, ideal para o verão. Comprimento abaixo do joelho.',
    sellerName: 'Ana Silva',
    sellerRating: 4.8,
    sellerReviews: 23,
    shippingEstimate: '5-8 dias úteis',
  },
  '2': {
    id: '2',
    title: 'Calça Jeans Levis 501',
    price: 120,
    condition: 'Ótimo',
    size: '40',
    brand: "Levi's",
    color: 'Azul',
    description: 'Calça jeans Levi\'s 501 original, modelo clássico. Cintura alta, corte reto. Pouco uso, sem desgaste. Tamanho 40 brasileiro.',
    sellerName: 'Carlos Lima',
    sellerRating: 4.5,
    sellerReviews: 15,
    shippingEstimate: '3-6 dias úteis',
  },
};

function getListingData(id: string): ListingData {
  return mockListings[id] ?? {
    id,
    title: 'Blazer Zara Oversized',
    price: 150,
    condition: 'Novo',
    size: 'G',
    brand: 'Zara',
    color: 'Preto',
    description: 'Blazer oversized da Zara, nunca usado. Modelagem ampla e moderna. Tecido estruturado de alta qualidade. Ideal para compor looks casuais e formais.',
    sellerName: 'Maria Souza',
    sellerRating: 4.9,
    sellerReviews: 42,
    shippingEstimate: '4-7 dias úteis',
  };
}

function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function ListingDetailPage({ params }: { params: { id: string } }) {
  const listing = getListingData(params.id);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <Link href="/listings" className="text-sm text-brand-600 hover:text-brand-700 transition">
          &larr; Voltar para resultados
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
        {/* Image gallery */}
        <div className="space-y-4">
          <div className="aspect-[4/5] bg-gray-100 rounded-xl flex items-center justify-center text-gray-300">
            <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="aspect-square bg-gray-100 rounded-lg flex items-center justify-center text-gray-300">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
              </div>
            ))}
          </div>
        </div>

        {/* Listing info */}
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">{listing.title}</h1>
            <p className="text-3xl font-bold text-brand-600">{formatBRL(listing.price)}</p>
          </div>

          {/* Details */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-500 mb-1">Condição</p>
              <p className="text-sm font-medium text-gray-900">{listing.condition}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Tamanho</p>
              <p className="text-sm font-medium text-gray-900">{listing.size}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Marca</p>
              <p className="text-sm font-medium text-gray-900">{listing.brand}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Cor</p>
              <p className="text-sm font-medium text-gray-900">{listing.color}</p>
            </div>
          </div>

          {/* Description */}
          <div>
            <h2 className="text-sm font-semibold text-gray-900 mb-2">Descrição</h2>
            <p className="text-sm text-gray-600 leading-relaxed">{listing.description}</p>
          </div>

          {/* Action buttons */}
          <div className="space-y-3">
            <button className="w-full py-3 bg-brand-600 text-white rounded-xl font-medium hover:bg-brand-700 transition text-lg">
              Comprar agora
            </button>
            <button className="w-full py-3 border-2 border-brand-600 text-brand-600 rounded-xl font-medium hover:bg-brand-50 transition">
              Fazer oferta
            </button>
          </div>

          {/* Shipping */}
          <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl">
            <svg className="w-5 h-5 text-gray-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
            <div>
              <p className="text-sm font-medium text-gray-900">Envio estimado</p>
              <p className="text-xs text-gray-500">{listing.shippingEstimate} via Correios ou Jadlog</p>
            </div>
          </div>

          {/* Buyer protection */}
          <div className="flex items-center gap-3 p-4 bg-green-50 rounded-xl">
            <svg className="w-5 h-5 text-green-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <div>
              <p className="text-sm font-medium text-gray-900">Proteção ao comprador</p>
              <p className="text-xs text-gray-500">Reembolso garantido se o item não corresponder ao anúncio</p>
            </div>
          </div>

          {/* Seller card */}
          <div className="p-4 border border-gray-200 rounded-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-brand-100 rounded-full flex items-center justify-center text-brand-600 font-semibold text-sm">
                {listing.sellerName.charAt(0)}
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">{listing.sellerName}</p>
                <div className="flex items-center gap-1">
                  <svg className="w-3.5 h-3.5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                  <span className="text-xs text-gray-600">{listing.sellerRating} ({listing.sellerReviews} avaliações)</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
