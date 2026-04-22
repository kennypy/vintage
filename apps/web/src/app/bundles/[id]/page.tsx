'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { apiDelete, apiGet } from '@/lib/api';

interface BundleItem {
  id: string;
  listingId: string;
  listing: {
    id: string;
    title: string;
    priceBrl: string | number;
    images: Array<{ url: string }>;
  };
}

interface Bundle {
  id: string;
  status: 'OPEN' | 'CHECKED_OUT' | 'EXPIRED';
  items: BundleItem[];
}

const fmt = (v: number) =>
  `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function BundleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    apiGet<Bundle>(`/bundles/${encodeURIComponent(id)}`)
      .then(setBundle)
      .catch(() => setBundle(null))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (listingId: string) => {
    if (!bundle) return;
    if (!window.confirm('Remover este item do pacote?')) return;
    try {
      await apiDelete(
        `/bundles/${encodeURIComponent(bundle.id)}/items/${encodeURIComponent(listingId)}`,
      );
      load();
    } catch {
      alert('Não foi possível remover.');
    }
  };

  if (loading) return <p className="p-6 text-gray-500">Carregando…</p>;
  if (!bundle) return <p className="p-6 text-gray-500">Pacote não encontrado.</p>;

  const subtotal = bundle.items.reduce((s, it) => s + Number(it.listing.priceBrl), 0);
  const open = bundle.status === 'OPEN';

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-3xl font-bold">Pacote</h1>
      <p className="mt-1 text-gray-600">
        {bundle.items.length} {bundle.items.length === 1 ? 'item' : 'itens'} · frete combinado
      </p>

      <ul className="mt-6 space-y-2">
        {bundle.items.map((it) => (
          <li
            key={it.id}
            className="flex items-center gap-4 rounded-xl bg-white p-3 shadow-sm"
          >
            {it.listing.images[0]?.url ? (
              <Image
                src={it.listing.images[0].url}
                alt=""
                width={64}
                height={64}
                className="h-16 w-16 rounded-lg object-cover"
                unoptimized
              />
            ) : (
              <div className="h-16 w-16 rounded-lg bg-gray-200" />
            )}
            <div className="flex-1">
              <p className="font-medium text-gray-900">{it.listing.title}</p>
              <p className="text-sm font-semibold text-brand-600">
                {fmt(Number(it.listing.priceBrl))}
              </p>
            </div>
            {open && (
              <button
                type="button"
                onClick={() => remove(it.listingId)}
                className="text-sm text-red-600 hover:underline"
              >
                Remover
              </button>
            )}
          </li>
        ))}
      </ul>

      <div className="mt-6 rounded-xl bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-gray-700">Subtotal</span>
          <span className="font-bold text-gray-900">{fmt(subtotal)}</span>
        </div>
      </div>

      {open && (
        <button
          type="button"
          disabled={bundle.items.length < 2}
          onClick={() => router.push(`/checkout?bundleId=${bundle.id}`)}
          className="mt-6 w-full rounded-xl bg-brand-600 p-4 font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          Finalizar pacote
        </button>
      )}
    </main>
  );
}
