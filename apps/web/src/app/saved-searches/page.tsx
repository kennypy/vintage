'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiDelete, apiGet, apiPatch } from '@/lib/api';

interface SavedSearch {
  id: string;
  query: string;
  filtersJson: Record<string, unknown>;
  notify: boolean;
  createdAt: string;
}

export default function SavedSearchesPage() {
  const [items, setItems] = useState<SavedSearch[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    setLoading(true);
    apiGet<{ items: SavedSearch[] }>('/saved-searches')
      .then((r) => setItems(r.items))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const toggleNotify = async (item: SavedSearch) => {
    const next = !item.notify;
    setItems((prev) => prev.map((s) => (s.id === item.id ? { ...s, notify: next } : s)));
    try {
      await apiPatch(`/saved-searches/${encodeURIComponent(item.id)}`, { notify: next });
    } catch {
      setItems((prev) => prev.map((s) => (s.id === item.id ? { ...s, notify: item.notify } : s)));
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm('Remover esta busca salva?')) return;
    setItems((prev) => prev.filter((s) => s.id !== id));
    try {
      await apiDelete(`/saved-searches/${encodeURIComponent(id)}`);
    } catch {
      refresh();
    }
  };

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-3xl font-bold">Buscas salvas</h1>
      <p className="mt-1 text-gray-600">
        Te avisamos quando novos anúncios baterem com essas buscas.
      </p>

      <div className="mt-6">
        {loading ? (
          <p className="text-gray-500">Carregando…</p>
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center">
            <p className="text-gray-600">Nenhuma busca salva ainda.</p>
            <p className="mt-2 text-sm text-gray-500">
              Faça uma busca e toque em &ldquo;Salvar busca&rdquo; para começar.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {items.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between rounded-xl bg-white p-4 shadow-sm"
              >
                <Link
                  href={`/?q=${encodeURIComponent(s.query)}`}
                  className="flex-1 truncate font-medium text-gray-900 hover:underline"
                >
                  {s.query}
                </Link>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-sm text-gray-600">
                    <input
                      type="checkbox"
                      checked={s.notify}
                      onChange={() => toggleNotify(s)}
                      className="h-4 w-4"
                    />
                    Avisar
                  </label>
                  <button
                    type="button"
                    onClick={() => remove(s.id)}
                    className="text-sm text-red-600 hover:underline"
                  >
                    Remover
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
