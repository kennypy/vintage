'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import ListingCard from '@/components/ListingCard';
import { apiGet } from '@/lib/api';

interface ApiListingItem {
  id: string;
  title: string;
  priceBrl?: number;
  price?: number;
  size?: string;
  condition?: string;
  seller?: { name: string };
  sellerName?: string;
  images?: Array<{ url: string } | string>;
  imageUrl?: string;
}

interface ListingItem {
  id: string;
  title: string;
  price: number;
  size: string;
  condition: string;
  sellerName: string;
  imageUrl?: string;
}

function normalizeItem(raw: ApiListingItem): ListingItem {
  let imageUrl: string | undefined;
  if (raw.imageUrl) {
    imageUrl = raw.imageUrl;
  } else if (raw.images && raw.images.length > 0) {
    const first = raw.images[0];
    imageUrl = typeof first === 'string' ? first : first.url;
  }
  return {
    id: raw.id,
    title: raw.title,
    price: raw.priceBrl ?? raw.price ?? 0,
    size: raw.size ?? '',
    condition: raw.condition ?? '',
    sellerName: raw.seller?.name ?? raw.sellerName ?? '',
    imageUrl,
  };
}

const searchBubbles = [
  { label: 'Vestidos', href: '/listings?q=vestidos' },
  { label: 'Tenis', href: '/listings?q=tenis' },
  { label: 'Bolsas', href: '/listings?q=bolsas' },
  { label: 'Jaquetas', href: '/listings?q=jaquetas' },
  { label: 'Calcas Jeans', href: '/listings?q=calcas+jeans' },
  { label: 'Camisetas', href: '/listings?q=camisetas' },
  { label: 'Sandalia', href: '/listings?q=sandalia' },
  { label: 'Acessorios', href: '/listings?q=acessorios' },
  { label: 'Vintage', href: '/listings?q=vintage' },
  { label: 'Nike', href: '/listings?q=nike' },
  { label: 'Zara', href: '/listings?q=zara' },
  { label: 'Farm', href: '/listings?q=farm' },
];

const categories = [
  { name: 'Moda Feminina', icon: '👗', href: '/listings?category=moda-feminina' },
  { name: 'Moda Masculina', icon: '👔', href: '/listings?category=moda-masculina' },
  { name: 'Calcados', icon: '👟', href: '/listings?category=calcados' },
  { name: 'Bolsas', icon: '👜', href: '/listings?category=bolsas-mochilas' },
  { name: 'Acessorios', icon: '💎', href: '/listings?category=acessorios' },
  { name: 'Vintage', icon: '✨', href: '/listings?category=vintage-retro' },
];

const steps = [
  {
    title: 'Encontre',
    description: 'Explore milhares de pecas unicas de moda de segunda mao em todo o Brasil.',
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    ),
  },
  {
    title: 'Compre',
    description: 'Pague com PIX de forma rapida e segura. Protecao total ao comprador.',
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
  const router = useRouter();
  const [listings, setListings] = useState<ListingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    apiGet<{ items?: ApiListingItem[]; data?: ApiListingItem[] } | ApiListingItem[]>(
      '/listings?sort=newest&pageSize=8'
    )
      .then((response) => {
        const raw = Array.isArray(response)
          ? response
          : (response.items ?? response.data ?? []);
        setListings(raw.map(normalizeItem));
      })
      .catch(() => {
        setListings([]);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/listings?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  return (
    <>
      {/* Hero with Search */}
      <section className="bg-gradient-to-br from-brand-50 to-white py-12 sm:py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 mb-4">
            Moda de segunda mao
            <br />
            <span className="text-brand-600">com estilo e economia</span>
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto mb-8">
            Compre e venda pecas unicas no maior marketplace de moda sustentavel do Brasil.
          </p>

          {/* Search bar */}
          <form onSubmit={handleSearch} className="relative max-w-2xl mx-auto mb-6">
            <div className="flex items-center bg-white border-2 border-brand-200 rounded-2xl shadow-md overflow-hidden focus-within:border-brand-500 transition">
              <div className="pl-4 text-gray-400">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar pecas, marcas, categorias..."
                className="flex-1 px-4 py-4 text-base text-gray-900 placeholder-gray-400 bg-transparent focus:outline-none"
              />
              <button
                type="submit"
                className="px-6 py-4 bg-brand-600 text-white font-medium hover:bg-brand-700 transition text-sm"
              >
                Buscar
              </button>
            </div>
          </form>

          {/* Search bubbles */}
          <div className="flex flex-wrap justify-center gap-2 mb-8">
            {searchBubbles.map((bubble) => (
              <Link
                key={bubble.label}
                href={bubble.href}
                className="px-4 py-1.5 bg-white border border-gray-200 rounded-full text-sm text-gray-600 hover:border-brand-400 hover:text-brand-600 hover:shadow-sm transition"
              >
                {bubble.label}
              </Link>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/listings"
              className="px-8 py-3 bg-brand-600 text-white rounded-xl font-medium hover:bg-brand-700 transition text-lg"
            >
              Explorar pecas
            </Link>
            <Link
              href="/sell"
              className="px-8 py-3 border-2 border-brand-600 text-brand-600 rounded-xl font-medium hover:bg-brand-50 transition text-lg"
            >
              Comecar a vender
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
          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="animate-pulse">
                  <div className="aspect-[4/5] bg-gray-200 rounded-xl mb-2" />
                  <div className="h-4 bg-gray-200 rounded w-20 mb-1" />
                  <div className="h-4 bg-gray-200 rounded w-32 mb-1" />
                  <div className="h-3 bg-gray-200 rounded w-16" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
              {listings.map((listing) => (
                <ListingCard key={listing.id} {...listing} />
              ))}
              {listings.length === 0 && (
                <p className="col-span-full text-center text-gray-500 py-8">
                  Nenhum anuncio disponivel no momento.
                </p>
              )}
            </div>
          )}
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
