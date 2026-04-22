'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { apiGet } from '@/lib/api';

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
  createdAt: string;
  items: BundleItem[];
}

const STATUS_LABELS: Record<Bundle['status'], string> = {
  OPEN: 'Aberto',
  CHECKED_OUT: 'Finalizado',
  EXPIRED: 'Expirado',
};

const fmt = (v: number) =>
  `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function BundlesPage() {
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet<Bundle[]>('/bundles')
      .then(setBundles)
      .catch(() => setBundles([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-3xl font-bold">Meus pacotes</h1>
      <p className="mt-1 text-gray-600">
        Agrupe itens do mesmo vendedor e economize no frete.
      </p>

      <div className="mt-6">
        {loading ? (
          <p className="text-gray-500">Carregando…</p>
        ) : bundles.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center">
            <p className="text-gray-600">Você ainda não tem pacotes.</p>
            <p className="mt-2 text-sm text-gray-500">
              Na página do vendedor, selecione dois ou mais itens para criar um pacote.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {bundles.map((b) => {
              const total = b.items.reduce((s, it) => s + Number(it.listing.priceBrl), 0);
              const preview = b.items.slice(0, 4);
              const extra = b.items.length - preview.length;
              return (
                <li key={b.id}>
                  <Link
                    href={`/bundles/${b.id}`}
                    className="flex items-center gap-4 rounded-xl bg-white p-4 shadow-sm hover:shadow-md"
                  >
                    <div className="flex">
                      {preview.map((it) => (
                        <div
                          key={it.id}
                          className="relative -ml-1 h-12 w-12 overflow-hidden rounded-lg border-2 border-white bg-gray-100 first:ml-0"
                        >
                          {it.listing.images[0]?.url ? (
                            <Image
                              src={it.listing.images[0].url}
                              alt=""
                              fill
                              sizes="48px"
                              className="object-cover"
                              unoptimized
                            />
                          ) : null}
                        </div>
                      ))}
                      {extra > 0 && (
                        <div className="-ml-1 flex h-12 w-12 items-center justify-center rounded-lg border-2 border-white bg-gray-200 text-xs font-semibold text-gray-600">
                          +{extra}
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">
                        {b.items.length} {b.items.length === 1 ? 'item' : 'itens'}
                      </p>
                      <p className="text-sm text-gray-500">
                        {fmt(total)} · {STATUS_LABELS[b.status]}
                      </p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
