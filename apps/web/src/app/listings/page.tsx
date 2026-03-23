import ListingCard from '@/components/ListingCard';
import ListingsFilter from './ListingsFilter';

const mockListings = [
  { id: '1', title: 'Vestido Midi Farm', price: 89.9, size: 'M', condition: 'Bom', sellerName: 'Ana Silva' },
  { id: '2', title: 'Calça Jeans Levis 501', price: 120, size: '40', condition: 'Ótimo', sellerName: 'Carlos Lima' },
  { id: '3', title: 'Blazer Zara Oversized', price: 150, size: 'G', condition: 'Novo', sellerName: 'Maria Souza' },
  { id: '4', title: 'Tênis Adidas Stan Smith', price: 199.9, size: '38', condition: 'Bom', sellerName: 'Pedro Costa' },
  { id: '5', title: 'Bolsa Arezzo Couro', price: 250, size: 'U', condition: 'Ótimo', sellerName: 'Juliana Reis' },
  { id: '6', title: 'Camisa Polo Ralph Lauren', price: 95, size: 'G', condition: 'Bom', sellerName: 'Lucas Mendes' },
  { id: '7', title: 'Saia Midi Animale', price: 180, size: 'P', condition: 'Novo', sellerName: 'Fernanda Oliveira' },
  { id: '8', title: 'Jaqueta Jeans Levi\'s', price: 135, size: 'M', condition: 'Ótimo', sellerName: 'Rafael Santos' },
  { id: '9', title: 'Sandália Schutz Salto', price: 165, size: '37', condition: 'Bom', sellerName: 'Camila Rocha' },
  { id: '10', title: 'Moletom Nike Vintage', price: 110, size: 'G', condition: 'Bom', sellerName: 'Bruno Almeida' },
  { id: '11', title: 'Vestido Longo Morena Rosa', price: 220, size: 'P', condition: 'Novo', sellerName: 'Isabela Ferreira' },
  { id: '12', title: 'Bermuda Osklen Masculina', price: 75, size: 'M', condition: 'Ótimo', sellerName: 'Thiago Barbosa' },
];

export default function ListingsPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Search bar */}
      <div className="mb-8">
        <div className="relative max-w-2xl mx-auto">
          <input
            type="text"
            placeholder="Buscar roupas, marcas, estilos..."
            className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent"
          />
          <svg
            className="absolute left-3 top-3.5 h-4 w-4 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>

      <div className="flex gap-8">
        {/* Filter sidebar */}
        <ListingsFilter />

        {/* Listing grid */}
        <div className="flex-1">
          <div className="flex items-center justify-between mb-6">
            <p className="text-sm text-gray-500">{mockListings.length} resultados</p>
            <select className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-600">
              <option>Mais relevantes</option>
              <option>Menor preço</option>
              <option>Maior preço</option>
              <option>Mais recentes</option>
            </select>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {mockListings.map((listing) => (
              <ListingCard key={listing.id} {...listing} />
            ))}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-center gap-2 mt-10">
            <button className="px-3 py-2 text-sm text-gray-400 rounded-lg" disabled>
              Anterior
            </button>
            <button className="px-3 py-2 text-sm bg-brand-600 text-white rounded-lg">1</button>
            <button className="px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg">2</button>
            <button className="px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg">3</button>
            <button className="px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg">
              Próxima
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
