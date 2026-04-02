'use client';

import { useEffect, useState } from 'react';
import { apiGet } from '@/lib/api';

interface SaleItem {
  id: string;
  itemPriceBrl: number;
  totalBrl: number;
  shippingCostBrl: number;
  discountBrl: number | null;
  paymentMethod: string;
  confirmedAt: string | null;
  createdAt: string;
  buyer: { id: string; name: string; email: string };
  seller: { id: string; name: string; email: string };
  listing: {
    id: string;
    title: string;
    category: { namePt: string } | null;
    brand: { name: string } | null;
    condition: string;
  };
}

interface SalesResponse {
  items: SaleItem[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

interface CategorySale {
  categoryId: string;
  categoryName: string;
  totalSales: number;
  totalRevenueBrl: number;
  avgPriceBrl: number;
  avgDaysToSell: number;
}

interface PricingEntry {
  categoryName: string;
  condition: string;
  brandName: string | null;
  count: number;
  avgPriceBrl: number;
  minPriceBrl: number;
  maxPriceBrl: number;
  medianPriceBrl: number;
}

function formatBrl(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

type Tab = 'sales' | 'categories' | 'pricing';

export default function AnalyticsPage() {
  const [tab, setTab] = useState<Tab>('sales');
  const [sales, setSales] = useState<SalesResponse | null>(null);
  const [categories, setCategories] = useState<CategorySale[]>([]);
  const [pricing, setPricing] = useState<PricingEntry[]>([]);
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');

  useEffect(() => {
    if (tab === 'sales') {
      apiGet<SalesResponse>(`/admin/analytics/sales?page=${page}&pageSize=20`)
        .then(setSales)
        .catch((e: Error) => setError(e.message));
    } else if (tab === 'categories') {
      apiGet<CategorySale[]>('/admin/analytics/sales-by-category')
        .then(setCategories)
        .catch((e: Error) => setError(e.message));
    } else if (tab === 'pricing') {
      apiGet<PricingEntry[]>('/admin/analytics/pricing')
        .then(setPricing)
        .catch((e: Error) => setError(e.message));
    }
  }, [tab, page]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Vendas & Analytics</h1>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
          {error}
          <button className="ml-2 underline" onClick={() => setError('')}>fechar</button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex space-x-1 mb-6 bg-gray-200 rounded-lg p-1 w-fit">
        {([
          ['sales', 'Vendas'],
          ['categories', 'Por Categoria'],
          ['pricing', 'Dados de Preco'],
        ] as [Tab, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => { setTab(key); setPage(1); }}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === key ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Sales Tab */}
      {tab === 'sales' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Item</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700 hidden md:table-cell">Vendedor</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700 hidden md:table-cell">Comprador</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-700">Preco</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-700 hidden lg:table-cell">Total</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-700 hidden lg:table-cell">Pagamento</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700 hidden lg:table-cell">Data</th>
              </tr>
            </thead>
            <tbody>
              {!sales && (
                <tr><td colSpan={7} className="text-center py-8 text-gray-400">Carregando...</td></tr>
              )}
              {sales?.items.map((sale) => (
                <tr key={sale.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium">{sale.listing.title}</div>
                    <div className="text-xs text-gray-400">
                      {sale.listing.category?.namePt ?? '-'} {sale.listing.brand ? `/ ${sale.listing.brand.name}` : ''}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-500 hidden md:table-cell">{sale.seller.name}</td>
                  <td className="px-4 py-3 text-gray-500 hidden md:table-cell">{sale.buyer.name}</td>
                  <td className="px-4 py-3 text-right font-medium">{formatBrl(sale.itemPriceBrl)}</td>
                  <td className="px-4 py-3 text-right hidden lg:table-cell">{formatBrl(sale.totalBrl)}</td>
                  <td className="px-4 py-3 text-center hidden lg:table-cell">
                    <span className="text-xs px-2 py-1 rounded-full bg-gray-100">{sale.paymentMethod}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 hidden lg:table-cell">
                    {sale.confirmedAt ? new Date(sale.confirmedAt).toLocaleDateString('pt-BR') : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {sales && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 text-sm text-gray-600">
              <span>{sales.total} vendas</span>
              <div className="space-x-2">
                <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1 border rounded disabled:opacity-40">Anterior</button>
                <span>Pagina {page}</span>
                <button disabled={!sales.hasMore} onClick={() => setPage((p) => p + 1)} className="px-3 py-1 border rounded disabled:opacity-40">Proxima</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Categories Tab */}
      {tab === 'categories' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Categoria</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-700">Vendas</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-700">Receita</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-700">Preco Medio</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-700 hidden md:table-cell">Dias p/ Vender</th>
              </tr>
            </thead>
            <tbody>
              {categories.length === 0 && (
                <tr><td colSpan={5} className="text-center py-8 text-gray-400">Sem dados</td></tr>
              )}
              {categories.map((cat) => (
                <tr key={cat.categoryId} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{cat.categoryName}</td>
                  <td className="px-4 py-3 text-right">{cat.totalSales}</td>
                  <td className="px-4 py-3 text-right">{formatBrl(cat.totalRevenueBrl)}</td>
                  <td className="px-4 py-3 text-right">{formatBrl(cat.avgPriceBrl)}</td>
                  <td className="px-4 py-3 text-right hidden md:table-cell">{cat.avgDaysToSell.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pricing Tab */}
      {tab === 'pricing' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
          <p className="px-4 py-3 text-sm text-gray-500 border-b border-gray-200">
            Dados de precos por categoria, condicao e marca — base para precificacao inteligente.
          </p>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Categoria</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Condicao</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700 hidden md:table-cell">Marca</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-700">Vendas</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-700">Media</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-700 hidden lg:table-cell">Mediana</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-700 hidden lg:table-cell">Min</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-700 hidden lg:table-cell">Max</th>
              </tr>
            </thead>
            <tbody>
              {pricing.length === 0 && (
                <tr><td colSpan={8} className="text-center py-8 text-gray-400">Sem dados</td></tr>
              )}
              {pricing.map((entry, i) => (
                <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3">{entry.categoryName}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs px-2 py-1 rounded-full bg-gray-100">{entry.condition}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 hidden md:table-cell">{entry.brandName ?? '-'}</td>
                  <td className="px-4 py-3 text-right">{entry.count}</td>
                  <td className="px-4 py-3 text-right font-medium">{formatBrl(entry.avgPriceBrl)}</td>
                  <td className="px-4 py-3 text-right hidden lg:table-cell">{formatBrl(entry.medianPriceBrl)}</td>
                  <td className="px-4 py-3 text-right hidden lg:table-cell">{formatBrl(entry.minPriceBrl)}</td>
                  <td className="px-4 py-3 text-right hidden lg:table-cell">{formatBrl(entry.maxPriceBrl)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
