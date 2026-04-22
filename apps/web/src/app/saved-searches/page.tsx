'use client';

import { useState } from 'react';
import Link from 'next/link';
import { apiDelete, apiPatch } from '@/lib/api';
import { useApiQuery, unwrapList } from '@/lib/useApiQuery';

interface SavedSearch {
  id: string;
  query: string;
  filtersJson: Record<string, unknown>;
  notify: boolean;
  createdAt: string;
}

export default function SavedSearchesPage() {
  const { data, loading, error, refetch } = useApiQuery<SavedSearch[]>(
    '/saved-searches',
    { requireAuth: true, transform: unwrapList<SavedSearch> },
  );
  const items = data ?? [];
  const [mutationError, setMutationError] = useState<string | null>(null);

  const toggleNotify = async (item: SavedSearch) => {
    const next = !item.notify;
    try {
      await apiPatch(`/saved-searches/${encodeURIComponent(item.id)}`, { notify: next });
      await refetch();
    } catch (err) {
      setMutationError(
        err instanceof Error && err.message
          ? err.message
          : 'Não foi possível atualizar a notificação.',
      );
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm('Remover esta busca salva?')) return;
    try {
      await apiDelete(`/saved-searches/${encodeURIComponent(id)}`);
      await refetch();
    } catch (err) {
      setMutationError(
        err instanceof Error && err.message
          ? err.message
          : 'Não foi possível remover a busca salva.',
      );
    }
  };

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-3xl font-bold">Buscas salvas</h1>
      <p className="mt-1 text-gray-600">
        Te avisamos quando novos anúncios baterem com essas buscas.
      </p>

      <div className="mt-6">
        {(error || mutationError) && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
            {mutationError ?? error}
          </div>
        )}
        {loading ? (
          <p className="text-gray-500">Carregando…</p>
        ) : error && items.length === 0 ? null : items.length === 0 ? (
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
