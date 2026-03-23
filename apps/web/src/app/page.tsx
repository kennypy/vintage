import Link from 'next/link';
import ListingCard from '@/components/ListingCard';

const featuredListings = [
  { id: '1', title: 'Vestido Midi Farm', price: 89.9, size: 'M', condition: 'Bom', sellerName: 'Ana Silva' },
  { id: '2', title: 'Calça Jeans Levis 501', price: 120, size: '40', condition: 'Ótimo', sellerName: 'Carlos Lima' },
  { id: '3', title: 'Blazer Zara Oversized', price: 150, size: 'G', condition: 'Novo', sellerName: 'Maria Souza' },
  { id: '4', title: 'Tênis Adidas Stan Smith', price: 199.9, size: '38', condition: 'Bom', sellerName: 'Pedro Costa' },
  { id: '5', title: 'Bolsa Arezzo Couro', price: 250, size: 'U', condition: 'Ótimo', sellerName: 'Juliana Reis' },
  { id: '6', title: 'Camisa Polo Ralph Lauren', price: 95, size: 'G', condition: 'Bom', sellerName: 'Lucas Mendes' },
  { id: '7', title: 'Saia Midi Animale', price: 180, size: 'P', condition: 'Novo', sellerName: 'Fernanda Oliveira' },
  { id: '8', title: 'Jaqueta Jeans Levi\'s', price: 135, size: 'M', condition: 'Ótimo', sellerName: 'Rafael Santos' },
];

const categories = [
  { name: 'Vestidos', icon: '👗', href: '/listings?category=vestidos' },
  { name: 'Calças', icon: '👖', href: '/listings?category=calcas' },
  { name: 'Camisetas', icon: '👕', href: '/listings?category=camisetas' },
  { name: 'Sapatos', icon: '👟', href: '/listings?category=sapatos' },
  { name: 'Bolsas', icon: '👜', href: '/listings?category=bolsas' },
  { name: 'Acessórios', icon: '💍', href: '/listings?category=acessorios' },
];

const steps = [
  {
    title: 'Encontre',
    description: 'Explore milhares de peças únicas de moda de segunda mão em todo o Brasil.',
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    ),
  },
  {
    title: 'Compre',
    description: 'Pague com PIX de forma rápida e segura. Proteção total ao comprador.',
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
      </svg>
    ),
  },
  {
    title: 'Receba',
    description: 'Entrega rastreada pelos Correios ou Jadlog direto na sua casa.',
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
      </svg>
    ),
  },
];

export default function Home() {
  return (
    <>
      {/* Hero */}
      <section className="bg-gradient-to-br from-brand-50 to-white py-16 sm:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 mb-6">
            Moda de segunda mão
            <br />
            <span className="text-brand-600">com estilo e economia</span>
          </h1>
          <p className="text-lg sm:text-xl text-gray-600 max-w-2xl mx-auto mb-8">
            Compre e venda peças únicas no maior marketplace de moda sustentável do Brasil.
            Sem taxas para vendedores. Proteção ao comprador.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/listings"
              className="px-8 py-3 bg-brand-600 text-white rounded-xl font-medium hover:bg-brand-700 transition text-lg"
            >
              Explorar peças
            </Link>
            <Link
              href="/sell"
              className="px-8 py-3 border-2 border-brand-600 text-brand-600 rounded-xl font-medium hover:bg-brand-50 transition text-lg"
            >
              Começar a vender
            </Link>
          </div>
        </div>
      </section>

      {/* Featured listings */}
      <section className="py-12 sm:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-bold text-gray-900">Destaques</h2>
            <Link href="/listings" className="text-sm text-brand-600 hover:text-brand-700 transition">
              Ver tudo
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
            {featuredListings.map((listing) => (
              <ListingCard key={listing.id} {...listing} />
            ))}
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="py-12 sm:py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-8 text-center">Categorias</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {categories.map((cat) => (
              <Link
                key={cat.name}
                href={cat.href}
                className="flex flex-col items-center gap-3 p-6 bg-white rounded-xl hover:shadow-md transition"
              >
                <span className="text-3xl">{cat.icon}</span>
                <span className="text-sm font-medium text-gray-700">{cat.name}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-12 sm:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-12 text-center">Como funciona</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            {steps.map((step, index) => (
              <div key={step.title} className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-brand-50 text-brand-600 rounded-full mb-4">
                  {step.icon}
                </div>
                <div className="text-sm text-brand-600 font-semibold mb-1">Passo {index + 1}</div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">{step.title}</h3>
                <p className="text-sm text-gray-600">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
