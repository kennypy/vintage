'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useApiQuery } from '@/lib/useApiQuery';

interface Overview {
  totalSales: number;
  totalRevenueBrl: number;
  avgSalePriceBrl: number;
  activeListings: number;
  ratingAvg: number;
  ratingCount: number;
}

interface ListingPerformance {
  id: string;
  title: string;
  priceBrl: number;
  status: string;
  viewCount: number;
  favoriteCount: number;
  sellabilityScore: number;
  daysToSell: number | null;
  thumbnailUrl: string | null;
  suggestedPriceBrl: number | null;
  priceDiffPct: number | null;
  isAuthentic: boolean;
}

interface CategoryTimeToSell {
  categoryId: string;
  categoryName: string;
  avgDaysToSell: number;
  salesCount: number;
}

interface TopDemandCategory {
  categoryId: string;
  categoryName: string;
  listingCount: number;
  totalViews: number;
  totalFavorites: number;
  demandScore: number;
}

interface SellerDashboard {
  overview: Overview;
  listingPerformance: ListingPerformance[];
  timeToSellByCategory: CategoryTimeToSell[];
  topCategories: TopDemandCategory[];
}

const fmtBrl = (v: number) =>
  `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function SellerDashboardPage() {
  const { data, loading, error } = useApiQuery<SellerDashboard>('/seller-insights', {
    requireAuth: true,
  });

  if (loading) return <p className="p-6 text-gray-500">Carregando…</p>;
  if (error) return <p className="p-6 text-sm text-red-600" role="alert">{error}</p>;
  if (!data) return <p className="p-6 text-gray-500">Não foi possível carregar o painel.</p>;

  return (
    <main className="mx-auto max-w-5xl p-6">
      <h1 className="text-3xl font-bold">Painel da vendedora</h1>
      <p className="mt-1 text-gray-600">
        Analise o desempenho dos anúncios e descubra o que está em alta.
      </p>

      <section className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Vendas" value={String(data.overview.totalSales)} />
        <Tile label="Receita" value={fmtBrl(data.overview.totalRevenueBrl)} />
        <Tile label="Anúncios ativos" value={String(data.overview.activeListings)} />
        <Tile
          label="Avaliação"
          value={
            data.overview.ratingCount > 0
              ? `${data.overview.ratingAvg.toFixed(1)}★ (${data.overview.ratingCount})`
              : '—'
          }
        />
        {data.overview.avgSalePriceBrl > 0 && (
          <Tile label="Preço médio" value={fmtBrl(data.overview.avgSalePriceBrl)} />
        )}
      </section>

      {data.listingPerformance.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-bold">Seus anúncios</h2>
          <ul className="space-y-2">
            {data.listingPerformance.slice(0, 20).map((l) => (
              <li
                key={l.id}
                className="flex items-center gap-4 rounded-xl bg-white p-3 shadow-sm"
              >
                {l.thumbnailUrl ? (
                  <Image
                    src={l.thumbnailUrl}
                    alt=""
                    width={56}
                    height={56}
                    className="h-14 w-14 rounded-lg object-cover"
                    unoptimized
                  />
                ) : (
                  <div className="h-14 w-14 rounded-lg bg-gray-200" />
                )}
                <div className="flex-1 min-w-0">
                  <Link
                    href={`/listings/${l.id}`}
                    className="truncate font-medium text-gray-900 hover:underline"
                  >
                    {l.title}
                  </Link>
                  <p className="text-xs text-gray-500">
                    {fmtBrl(l.priceBrl)} · {l.viewCount} visualizações · {l.favoriteCount} favoritos
                    {l.daysToSell != null ? ` · vendido em ${l.daysToSell}d` : ''}
                  </p>
                  {l.priceDiffPct != null && (
                    <p className="text-xs text-gray-400">
                      {l.priceDiffPct === 0
                        ? 'Preço em linha com o sugerido'
                        : l.priceDiffPct > 0
                          ? `${l.priceDiffPct}% acima do sugerido`
                          : `${Math.abs(l.priceDiffPct)}% abaixo do sugerido`}
                    </p>
                  )}
                </div>
                <div className="flex h-10 min-w-[44px] items-center justify-center rounded-lg bg-brand-600 px-2 font-bold text-white">
                  {l.sellabilityScore}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.timeToSellByCategory.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-bold">Tempo médio de venda</h2>
          <ul className="space-y-2">
            {data.timeToSellByCategory.slice(0, 8).map((c) => (
              <li
                key={c.categoryId}
                className="flex items-center justify-between rounded-xl bg-white p-3 shadow-sm"
              >
                <span className="text-gray-800">{c.categoryName}</span>
                <span className="font-semibold text-brand-600">
                  {c.avgDaysToSell} {c.avgDaysToSell === 1 ? 'dia' : 'dias'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.topCategories.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-bold">Categorias em alta</h2>
          <ul className="space-y-2">
            {data.topCategories.slice(0, 5).map((c) => (
              <li
                key={c.categoryId}
                className="flex items-center justify-between rounded-xl bg-white p-3 shadow-sm"
              >
                <div>
                  <p className="text-gray-800">{c.categoryName}</p>
                  <p className="text-xs text-gray-500">
                    {c.listingCount} anúncios · {c.totalViews} visualizações · {c.totalFavorites} favoritos
                  </p>
                </div>
                <span className="font-semibold text-brand-600">
                  {Math.round(c.demandScore)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-gray-900">{value}</p>
    </div>
  );
}
