'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api';

interface Collection {
  id: string;
  name: string;
  isDefault: boolean;
  _count?: { favorites: number };
}

export default function CollectionsPage() {
  const [items, setItems] = useState<Collection[]>([]);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const list = await apiGet<Collection[]>('/favorite-collections');
      setItems(list);
    } catch (err) {
      setError(String(err).slice(0, 200));
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      await apiPost('/favorite-collections', { name: newName.trim() });
      setNewName('');
      await refresh();
    } catch (err) {
      setError(String(err).slice(0, 200));
    } finally {
      setCreating(false);
    }
  };

  const handleRename = async (id: string, current: string) => {
    const name = window.prompt('Novo nome:', current);
    if (!name || !name.trim()) return;
    try {
      await apiPatch(`/favorite-collections/${id}`, { name: name.trim() });
      await refresh();
    } catch (err) {
      setError(String(err).slice(0, 200));
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Remover "${name}"? Os itens voltam para a pasta padrão.`)) return;
    try {
      await apiDelete(`/favorite-collections/${id}`);
      await refresh();
    } catch (err) {
      setError(String(err).slice(0, 200));
    }
  };

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="mb-6 text-3xl font-bold">Minhas coleções</h1>

      <form onSubmit={handleCreate} className="mb-6 flex gap-2">
        <input
          className="flex-1 rounded-lg border border-gray-300 p-3"
          placeholder="Nova coleção (ex: Festa, Trabalho)"
          maxLength={64}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <button
          type="submit"
          disabled={creating}
          className="rounded-lg bg-brand-600 px-5 font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          Criar
        </button>
      </form>

      {error && <p className="mb-4 text-red-600">{error}</p>}

      <ul className="space-y-3">
        {items.map((col) => (
          <li key={col.id} className="flex items-center justify-between rounded-xl bg-white p-4 shadow-sm">
            <Link href={`/favorites/collections/${col.id}`} className="flex-1">
              <p className="font-semibold">{col.name}</p>
              <p className="text-xs text-gray-500">{col._count?.favorites ?? 0} itens</p>
            </Link>
            {!col.isDefault && (
              <div className="flex gap-2">
                <button
                  className="text-sm text-brand-600 hover:underline"
                  onClick={() => handleRename(col.id, col.name)}
                >
                  Renomear
                </button>
                <button
                  className="text-sm text-red-600 hover:underline"
                  onClick={() => handleDelete(col.id, col.name)}
                >
                  Remover
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
