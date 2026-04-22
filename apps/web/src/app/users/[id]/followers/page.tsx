'use client';

import { use } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useApiQuery } from '@/lib/useApiQuery';

interface FollowListItem {
  id: string;
  name: string;
  avatarUrl: string | null;
  ratingAvg: number;
  ratingCount: number;
  followerCount: number;
  followedAt: string;
}

interface FollowListResponse {
  items: FollowListItem[];
  total: number;
  page: number;
  totalPages: number;
}

export default function FollowersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, loading, error } = useApiQuery<FollowListResponse>(
    `/users/${encodeURIComponent(id)}/followers`,
  );

  if (loading) return <p className="p-6 text-gray-500">Carregando…</p>;
  if (error) return <p className="p-6 text-sm text-red-600" role="alert">{error}</p>;
  if (!data) return <p className="p-6 text-gray-500">Não foi possível carregar.</p>;

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-bold">
        {data.total} {data.total === 1 ? 'seguidor' : 'seguidores'}
      </h1>

      {data.items.length === 0 ? (
        <p className="mt-6 text-gray-500">Nenhum seguidor ainda.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {data.items.map((u) => (
            <li key={u.id}>
              <Link
                href={`/seller/${u.id}`}
                className="flex items-center gap-3 rounded-xl bg-white p-3 shadow-sm hover:shadow-md"
              >
                {u.avatarUrl ? (
                  <Image
                    src={u.avatarUrl}
                    alt=""
                    width={44}
                    height={44}
                    className="h-11 w-11 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gray-200 text-gray-500">
                    {u.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="flex-1">
                  <p className="font-medium text-gray-900">{u.name}</p>
                  <p className="text-xs text-gray-500">
                    {u.ratingCount > 0 ? `${u.ratingAvg.toFixed(1)}★ · ` : ''}
                    {u.followerCount} {u.followerCount === 1 ? 'seguidor' : 'seguidores'}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
