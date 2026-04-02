'use client';

import { useEffect, useState, useCallback } from 'react';
import { apiGet, apiPost, apiDelete } from '@/lib/api';

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
  isBanned: boolean;
  bannedReason: string | null;
  verified: boolean;
  createdAt: string;
  listingCount: number;
  ordersBought: number;
  ordersSold: number;
}

interface PaginatedUsers {
  items: AdminUser[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export default function UsersPage() {
  const [data, setData] = useState<PaginatedUsers | null>(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadUsers = useCallback(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: '20' });
    if (search.trim()) params.set('search', search.trim());
    apiGet<PaginatedUsers>(`/admin/users?${params}`)
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, [page, search]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  async function handleBan(user: AdminUser) {
    const reason = prompt(`Motivo para banir ${user.name}:`);
    if (!reason) return;
    setActionLoading(user.id);
    try {
      await apiPost(`/moderation/users/${user.id}/ban`, { reason });
      loadUsers();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao banir');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleUnban(user: AdminUser) {
    if (!confirm(`Desbanir ${user.name}?`)) return;
    setActionLoading(user.id);
    try {
      await apiDelete(`/moderation/users/${user.id}/ban`);
      loadUsers();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao desbanir');
    } finally {
      setActionLoading(null);
    }
  }

  async function handlePromote(user: AdminUser) {
    if (!confirm(`Promover ${user.name} a administrador?`)) return;
    setActionLoading(user.id);
    try {
      await apiPost(`/admin/users/${user.id}/promote`);
      loadUsers();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao promover');
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Gerenciamento de Usuarios</h1>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
          {error}
          <button className="ml-2 underline" onClick={() => setError('')}>fechar</button>
        </div>
      )}

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Buscar por nome ou email..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="border border-gray-300 rounded-lg px-4 py-2 text-sm w-full md:w-96"
        />
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-semibold text-gray-700">Nome</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-700 hidden md:table-cell">Email</th>
              <th className="text-center px-4 py-3 font-semibold text-gray-700">Role</th>
              <th className="text-center px-4 py-3 font-semibold text-gray-700">Status</th>
              <th className="text-center px-4 py-3 font-semibold text-gray-700 hidden lg:table-cell">Anuncios</th>
              <th className="text-center px-4 py-3 font-semibold text-gray-700 hidden lg:table-cell">Compras</th>
              <th className="text-center px-4 py-3 font-semibold text-gray-700 hidden lg:table-cell">Vendas</th>
              <th className="text-center px-4 py-3 font-semibold text-gray-700">Acoes</th>
            </tr>
          </thead>
          <tbody>
            {!data && (
              <tr><td colSpan={8} className="text-center py-8 text-gray-400">Carregando...</td></tr>
            )}
            {data?.items.map((user) => (
              <tr key={user.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{user.name}</td>
                <td className="px-4 py-3 text-gray-500 hidden md:table-cell">{user.email}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`text-xs px-2 py-1 rounded-full ${user.role === 'ADMIN' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>
                    {user.role}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  {user.isBanned ? (
                    <span className="text-xs px-2 py-1 rounded-full bg-red-100 text-red-700" title={user.bannedReason ?? ''}>
                      Banido
                    </span>
                  ) : (
                    <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700">Ativo</span>
                  )}
                </td>
                <td className="px-4 py-3 text-center hidden lg:table-cell">{user.listingCount}</td>
                <td className="px-4 py-3 text-center hidden lg:table-cell">{user.ordersBought}</td>
                <td className="px-4 py-3 text-center hidden lg:table-cell">{user.ordersSold}</td>
                <td className="px-4 py-3 text-center space-x-2">
                  {actionLoading === user.id ? (
                    <span className="text-xs text-gray-400">...</span>
                  ) : (
                    <>
                      {user.isBanned ? (
                        <button onClick={() => handleUnban(user)} className="text-green-600 hover:text-green-800 text-xs">
                          Desbanir
                        </button>
                      ) : (
                        <button onClick={() => handleBan(user)} className="text-red-500 hover:text-red-700 text-xs">
                          Banir
                        </button>
                      )}
                      {user.role !== 'ADMIN' && (
                        <button onClick={() => handlePromote(user)} className="text-purple-600 hover:text-purple-800 text-xs">
                          Promover
                        </button>
                      )}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {data && (
        <div className="flex items-center justify-between mt-4 text-sm text-gray-600">
          <span>{data.total} usuarios encontrados</span>
          <div className="space-x-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="px-3 py-1 border rounded disabled:opacity-40"
            >
              Anterior
            </button>
            <span>Pagina {page}</span>
            <button
              disabled={!data.hasMore}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1 border rounded disabled:opacity-40"
            >
              Proxima
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
