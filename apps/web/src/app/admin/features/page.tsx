'use client';

import { useEffect, useState, useCallback } from 'react';
import { apiGet, apiPost, apiDelete, apiPatch } from '@/lib/api';

interface FeatureFlag {
  id: string;
  key: string;
  enabled: boolean;
  description: string | null;
  metadata: Record<string, unknown> | null;
  updatedAt: string;
}

export default function FeatureTogglesPage() {
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [error, setError] = useState('');
  const [newKey, setNewKey] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);

  const loadFlags = useCallback(() => {
    apiGet<FeatureFlag[]>('/feature-flags')
      .then(setFlags)
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    loadFlags();
  }, [loadFlags]);

  async function handleToggle(flag: FeatureFlag) {
    try {
      const updated = await apiPatch<FeatureFlag>(`/admin/feature-flags/${flag.id}`, {
        enabled: !flag.enabled,
      });
      setFlags((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao atualizar');
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newKey.trim()) return;
    setCreating(true);
    try {
      const created = await apiPost<FeatureFlag>('/admin/feature-flags', {
        key: newKey.trim(),
        description: newDesc.trim() || undefined,
        enabled: false,
      });
      setFlags((prev) => [...prev, created].sort((a, b) => a.key.localeCompare(b.key)));
      setNewKey('');
      setNewDesc('');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao criar');
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(flag: FeatureFlag) {
    if (!confirm(`Remover feature flag "${flag.key}"?`)) return;
    try {
      await apiDelete(`/admin/feature-flags/${flag.id}`);
      setFlags((prev) => prev.filter((f) => f.id !== flag.id));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao remover');
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Feature Toggles</h1>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
          {error}
          <button className="ml-2 underline" onClick={() => setError('')}>
            fechar
          </button>
        </div>
      )}

      {/* Create Form */}
      <form onSubmit={handleCreate} className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Nova Feature Flag</h2>
        <div className="flex flex-col md:flex-row gap-3">
          <input
            type="text"
            placeholder="key (ex: video_upload)"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1"
            pattern="^[a-z][a-z0-9_]*$"
            required
          />
          <input
            type="text"
            placeholder="Descricao (opcional)"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1"
          />
          <button
            type="submit"
            disabled={creating}
            className="bg-purple-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50"
          >
            {creating ? 'Criando...' : 'Criar'}
          </button>
        </div>
      </form>

      {/* Flags Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-5 py-3 font-semibold text-gray-700">Key</th>
              <th className="text-left px-5 py-3 font-semibold text-gray-700 hidden md:table-cell">Descricao</th>
              <th className="text-center px-5 py-3 font-semibold text-gray-700">Status</th>
              <th className="text-center px-5 py-3 font-semibold text-gray-700">Acoes</th>
            </tr>
          </thead>
          <tbody>
            {flags.length === 0 && (
              <tr>
                <td colSpan={4} className="text-center py-8 text-gray-400">
                  Nenhuma feature flag cadastrada
                </td>
              </tr>
            )}
            {flags.map((flag) => (
              <tr key={flag.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-5 py-3 font-mono text-sm">{flag.key}</td>
                <td className="px-5 py-3 text-gray-500 hidden md:table-cell">
                  {flag.description || '-'}
                </td>
                <td className="px-5 py-3 text-center">
                  <button
                    onClick={() => handleToggle(flag)}
                    className={`
                      relative inline-flex h-6 w-11 items-center rounded-full transition-colors
                      ${flag.enabled ? 'bg-green-500' : 'bg-gray-300'}
                    `}
                  >
                    <span
                      className={`
                        inline-block h-4 w-4 transform rounded-full bg-white transition-transform
                        ${flag.enabled ? 'translate-x-6' : 'translate-x-1'}
                      `}
                    />
                  </button>
                </td>
                <td className="px-5 py-3 text-center">
                  <button
                    onClick={() => handleDelete(flag)}
                    className="text-red-500 hover:text-red-700 text-sm"
                  >
                    Remover
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
