'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { apiGet, apiDelete } from '@/lib/api';

interface BlockSummary {
  userId: string;
  blockedAt: string;
  name: string;
  avatarUrl: string | null;
}

export default function BlockedUsersPage() {
  const router = useRouter();
  const [blocks, setBlocks] = useState<BlockSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await apiGet<{ items: BlockSummary[]; blockedIds: string[] }>('/users/me/blocks');
      setBlocks(data.items);
    } catch {
      router.push('/auth/login');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(t);
  }, [notice]);

  const handleUnblock = async (item: BlockSummary) => {
    if (typeof window !== 'undefined' && !window.confirm(
      `Desbloquear ${item.name}? Essa pessoa poderá enviar mensagens e ofertas para você novamente.`,
    )) {
      return;
    }
    setPendingIds((prev) => new Set(prev).add(item.userId));
    try {
      await apiDelete(`/users/${encodeURIComponent(item.userId)}/block`);
      setBlocks((prev) => prev.filter((b) => b.userId !== item.userId));
      setNotice({ type: 'success', msg: `${item.name} foi desbloqueado.` });
    } catch (err) {
      setNotice({
        type: 'error',
        msg: err instanceof Error && err.message ? err.message : 'Falha ao desbloquear.',
      });
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(item.userId);
        return next;
      });
    }
  };

  if (loading) {
    return <div className="animate-pulse h-64 bg-white border border-gray-200 rounded-xl" />;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-base font-semibold text-gray-900 mb-1">Usuários bloqueados</h1>
        <p className="text-sm text-gray-500">
          Usuários bloqueados não podem enviar mensagens, ofertas ou comprar seus anúncios.
          Eles não são avisados do bloqueio.
        </p>
      </div>

      {notice && (
        <div
          className={`p-3 rounded-xl text-sm border ${
            notice.type === 'success'
              ? 'bg-green-50 border-green-200 text-green-700'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}
          role={notice.type === 'error' ? 'alert' : 'status'}
        >
          {notice.msg}
        </div>
      )}

      {blocks.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
          <p className="text-sm text-gray-700 mb-1">Nenhum usuário bloqueado</p>
          <p className="text-xs text-gray-500">
            Use o menu ··· em um perfil de usuário para bloqueá-lo.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {blocks.map((b) => {
            const pending = pendingIds.has(b.userId);
            return (
              <li
                key={b.userId}
                className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-3"
              >
                <Link
                  href={`/seller/${encodeURIComponent(b.userId)}`}
                  className="flex items-center gap-3 flex-1 min-w-0"
                >
                  {b.avatarUrl ? (
                    <Image
                      src={b.avatarUrl}
                      alt=""
                      width={40}
                      height={40}
                      className="rounded-full object-cover flex-shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 font-semibold flex-shrink-0">
                      {b.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{b.name}</p>
                    <p className="text-xs text-gray-500">
                      Bloqueado em {new Date(b.blockedAt).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                </Link>
                <button
                  type="button"
                  onClick={() => handleUnblock(b)}
                  disabled={pending}
                  className="text-sm text-brand-600 hover:text-brand-700 font-medium disabled:opacity-40"
                >
                  {pending ? 'Desbloqueando…' : 'Desbloquear'}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
