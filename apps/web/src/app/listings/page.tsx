'use client';

import { Suspense, useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import ListingCard from '@/components/ListingCard';
import ListingsFilter, { FilterState } from './ListingsFilter';
import { apiGet } from '@/lib/api';

interface ListingItem {
  id: string;
  title: string;
  price: number;
  size: string;
  condition: string;
  sellerName: string;
  imageUrl?: string;
}

interface ListingsResponse {
  data: ListingItem[];
  total: number;
  page: number;
  totalPages: number;
}

const SORT_OPTIONS = [
  { value: 'relevance', label: 'Mais relevantes' },
  { value: 'price_asc', label: 'Menor preco' },
  { value: 'price_desc', label: 'Maior preco' },
  { value: 'newest', label: 'Mais recentes' },
];

export default function ListingsPage() {
  return (
    <Suspense fallback={<div className="max-w-7xl mx-auto px-4 py-8 text-center text-gray-500">Carregando...</div>}>
      <ListingsContent />
    </Suspense>
  );
}

function ListingsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [listings, setListings] = useState<ListingItem[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState(searchParams.get('q') ?? '');
  const [sort, setSort] = useState(searchParams.get('sort') ?? 'relevance');
  const [page, setPage] = useState(Number(searchParams.get('page') ?? '1'));
  const [filters, setFilters] = useState<FilterState>({
    category: searchParams.get('category') ?? '',
    condition: '',
    size: '',
    brand: '',
    priceMin: '',
    priceMax: '',
  });

  const fetchListings = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('sort', sort);
      if (search) params.set('q', search);
      if (filters.category) params.set('category', filters.category);
      if (filters.condition) params.set('condition', filters.condition);
      if (filters.size) params.set('size', filters.size);
      if (filters.brand) params.set('brand', filters.brand);
      if (filters.priceMin) params.set('priceMin', filters.priceMin);
      if (filters.priceMax) params.set('priceMax', filters.priceMax);

      const response = await apiGet<ListingsResponse | ListingItem[]>(
        `/listings?${params.toString()}`
      );

      if (Array.isArray(response)) {
        setListings(response);
        setTotal(response.length);
        setTotalPages(1);
      } else {
        setListings(response.data ?? []);
        setTotal(response.total ?? 0);
        setTotalPages(response.totalPages ?? 1);
      }
    } catch (_err) {
      setListings([]);
      setTotal(0);
      setTotalPages(1);
    } finally {
      setLoading(false);
    }
  }, [page, sort, search, filters]);

  useEffect(() => {
    fetchListings();
  }, [fetchListings]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
  };

  const handleSortChange = (newSort: string) => {
    setSort(newSort);
    setPage(1);
  };

  const handleFilterChange = useCallback((newFilters: FilterState) => {
    setFilters(newFilters);
    setPage(1);
  }, []);

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    router.push(`/listings?page=${newPage}&sort=${sort}${search ? `&q=${search}` : ''}`);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Search bar */}
      <div className="mb-8">
        <form onSubmit={handleSearch} className="relative max-w-2xl mx-auto">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
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
        </form>
      </div>

      <div className="flex gap-8">
        {/* Filter sidebar */}
        <ListingsFilter onFilterChange={handleFilterChange} />

        {/* Listing grid */}
        <div className="flex-1">
          <div className="flex items-center justify-between mb-6">
            <p className="text-sm text-gray-500">
              {loading ? 'Carregando...' : `${total} resultados`}
            </p>
            <select
              value={sort}
              onChange={(e) => handleSortChange(e.target.value)}
              className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-600"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {loading ? (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="animate-pulse">
                  <div className="aspect-[4/5] bg-gray-200 rounded-xl mb-2" />
                  <div className="h-4 bg-gray-200 rounded w-20 mb-1" />
                  <div className="h-4 bg-gray-200 rounded w-32 mb-1" />
                  <div className="h-3 bg-gray-200 rounded w-16" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {listings.map((listing) => (
                <ListingCard key={listing.id} {...listing} />
              ))}
              {listings.length === 0 && (
                <p className="col-span-full text-center text-gray-500 py-8">
                  Nenhum resultado encontrado.
                </p>
              )}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-10">
              <button
                onClick={() => handlePageChange(page - 1)}
                disabled={page <= 1}
                className="px-3 py-2 text-sm text-gray-400 rounded-lg disabled:opacity-50"
              >
                Anterior
              </button>
              {Array.from({ length: Math.min(totalPages, 5) }).map((_, i) => {
                const pageNum = i + 1;
                return (
                  <button
                    key={pageNum}
                    onClick={() => handlePageChange(pageNum)}
                    className={`px-3 py-2 text-sm rounded-lg ${
                      page === pageNum
                        ? 'bg-brand-600 text-white'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
              <button
                onClick={() => handlePageChange(page + 1)}
                disabled={page >= totalPages}
                className="px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-50"
              >
                Proxima
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
