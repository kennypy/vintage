'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { apiGet, apiPost, apiDelete } from '@/lib/api';
import ListingCard from '@/components/ListingCard';

interface SellerProfile {
  id: string;
  name: string;
  avatarUrl?: string;
  bio?: string;
  ratingAvg?: number;
  ratingCount?: number;
  listingCount?: number;
  followerCount?: number;
  followingCount?: number;
  isFollowing?: boolean;
  createdAt?: string;
}

interface Listing {
  id: string;
  title: string;
  priceBrl?: number;
  price?: number;
  size: string;
  condition: string;
  seller?: { name: string };
  sellerName?: string;
  images?: Array<{ url: string } | string>;
}

interface MeResponse {
  id: string;
}

function getImageUrl(img: { url: string } | string): string {
  return typeof img === 'string' ? img : img.url;
}

export default function SellerProfileClient({ id }: { id: string }) {
  const router = useRouter();
  const [seller, setSeller] = useState<SellerProfile | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [following, setFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);

  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockLoading, setBlockLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // The seller page is viewable while logged out; the block/follow actions
  // only make sense for authenticated callers. We hydrate auth-scoped data
  // via best-effort Promise.all — any of these can 401 without breaking the
  // public profile view.
  useEffect(() => {
    Promise.all([
      apiGet<SellerProfile>(`/users/${encodeURIComponent(id)}`).catch(() => null),
      apiGet<Listing[] | { data: Listing[]; items: Listing[] }>(`/users/${encodeURIComponent(id)}/listings`).catch(() => []),
      apiGet<{ blockedIds: string[] }>('/users/me/blocks').catch(() => ({ blockedIds: [] as string[] })),
      apiGet<MeResponse>('/users/me').catch(() => null),
    ]).then(([profile, listingRes, blocks, me]) => {
      if (profile) {
        setSeller(profile);
        setFollowing(profile.isFollowing ?? false);
      }
      const list = Array.isArray(listingRes)
        ? listingRes
        : ((listingRes as { items?: Listing[] }).items
           ?? (listingRes as { data?: Listing[] }).data
           ?? []);
      setListings(list);
      setIsBlocked(blocks.blockedIds.includes(id));
      setMyUserId(me?.id ?? null);
    }).finally(() => setLoading(false));
  }, [id]);

  // Close the action menu on outside-click and on Escape. Both listeners
  // are bound only while the menu is open and torn down on close/unmount
  // so there's no dangling global handler.
  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  // Auto-dismiss success notices after a few seconds.
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(t);
  }, [notice]);

  const isSelf = !!myUserId && myUserId === id;

  const handleFollow = async () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('vintage_token') : null;
    if (!token) return;

    setFollowLoading(true);
    try {
      if (following) {
        await apiDelete(`/users/${encodeURIComponent(id)}/follow`);
        setFollowing(false);
        if (seller) setSeller({ ...seller, followerCount: Math.max(0, (seller.followerCount ?? 1) - 1) });
      } else {
        await apiPost(`/users/${encodeURIComponent(id)}/follow`);
        setFollowing(true);
        if (seller) setSeller({ ...seller, followerCount: (seller.followerCount ?? 0) + 1 });
      }
    } catch {
      // silently fail
    } finally {
      setFollowLoading(false);
    }
  };

  const handleBlockToggle = async () => {
    if (!seller || isSelf) return;
    const token = typeof window !== 'undefined' ? localStorage.getItem('vintage_token') : null;
    if (!token) {
      setMenuOpen(false);
      setNotice('Faça login para bloquear usuários.');
      return;
    }

    setMenuOpen(false);
    setBlockLoading(true);
    try {
      if (isBlocked) {
        await apiDelete(`/users/${encodeURIComponent(seller.id)}/block`);
        setIsBlocked(false);
        setNotice(`${seller.name} foi desbloqueado.`);
      } else {
        await apiPost(`/users/${encodeURIComponent(seller.id)}/block`);
        setIsBlocked(true);
        // Local-only: blocked users should not read as followed. The backend
        // leaves the follow relationship alone, but interactions are gated
        // separately, so this is purely a display correction.
        if (following && seller) {
          setFollowing(false);
          setSeller({ ...seller, followerCount: Math.max(0, (seller.followerCount ?? 1) - 1) });
        }
        setNotice(`${seller.name} foi bloqueado. Mensagens e ofertas estão desativadas.`);
      }
    } catch {
      setNotice('Não foi possível atualizar o bloqueio. Tente novamente.');
    } finally {
      setBlockLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-6">
          <div className="flex gap-6">
            <div className="w-24 h-24 bg-gray-200 rounded-full" />
            <div className="flex-1 space-y-3">
              <div className="h-6 bg-gray-200 rounded w-48" />
              <div className="h-4 bg-gray-200 rounded w-32" />
              <div className="h-4 bg-gray-200 rounded w-64" />
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => <div key={i} className="aspect-[4/5] bg-gray-200 rounded-xl" />)}
          </div>
        </div>
      </div>
    );
  }

  if (!seller) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Vendedor nao encontrado</h1>
        <Link href="/listings" className="inline-block px-6 py-3 bg-brand-600 text-white rounded-xl font-medium hover:bg-brand-700 transition">
          Explorar anuncios
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Ephemeral block/unblock feedback */}
      {notice && (
        <div
          className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-800"
          role="status"
        >
          {notice}
        </div>
      )}

      {/* Blocked banner — explains why interactions are unavailable */}
      {isBlocked && (
        <div
          className="mb-4 flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700"
          role="alert"
        >
          <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 105.636 5.636a9 9 0 0012.728 12.728z" />
          </svg>
          <span>
            Você bloqueou este usuário. Mensagens e ofertas estão desativadas. Use o menu ··· para desbloquear.
          </span>
        </div>
      )}

      {/* Profile header */}
      <div className="flex flex-col sm:flex-row gap-6 mb-8">
        <div className="w-24 h-24 bg-brand-100 rounded-full flex items-center justify-center text-brand-600 font-bold text-3xl flex-shrink-0 overflow-hidden">
          {seller.avatarUrl ? (
            <Image src={seller.avatarUrl} alt={seller.name} width={96} height={96} className="rounded-full object-cover" />
          ) : (
            seller.name.charAt(0).toUpperCase()
          )}
        </div>
        <div className="flex-1">
          <div className="flex items-start justify-between gap-2">
            <h1 className="text-2xl font-bold text-gray-900">{seller.name}</h1>

            {/* Overflow menu — hidden on self-view */}
            {!isSelf && (
              <div className="relative" ref={menuRef}>
                <button
                  type="button"
                  onClick={() => setMenuOpen((v) => !v)}
                  disabled={blockLoading}
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  aria-label="Mais opções"
                  className="p-2 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 disabled:opacity-40"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                  </svg>
                </button>
                {menuOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 top-full mt-1 min-w-[200px] bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-10"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={handleBlockToggle}
                      className={`w-full text-left px-4 py-2 text-sm ${
                        isBlocked ? 'text-gray-700 hover:bg-gray-50' : 'text-red-600 hover:bg-red-50'
                      }`}
                    >
                      {isBlocked ? 'Desbloquear usuário' : 'Bloquear usuário'}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        router.push(
                          `/report/new?targetType=user&targetId=${encodeURIComponent(seller.id)}`,
                        );
                      }}
                      className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                    >
                      Denunciar usuário
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {seller.ratingAvg != null && (
            <div className="flex items-center gap-1 mt-1">
              <svg className="w-4 h-4 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              <span className="text-sm text-gray-600">
                {seller.ratingAvg} ({seller.ratingCount} avaliacoes)
              </span>
              <Link
                href={`/reviews?userId=${encodeURIComponent(seller.id)}&name=${encodeURIComponent(seller.name)}`}
                className="text-xs text-brand-600 hover:text-brand-700 ml-2"
              >
                Ver avaliacoes
              </Link>
            </div>
          )}
          {seller.bio && <p className="text-sm text-gray-600 mt-2">{seller.bio}</p>}

          <div className="flex gap-6 mt-3">
            <div className="text-center">
              <p className="text-lg font-bold text-gray-900">{seller.listingCount ?? listings.length}</p>
              <p className="text-xs text-gray-500">anuncios</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-gray-900">{seller.followerCount ?? 0}</p>
              <p className="text-xs text-gray-500">seguidores</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-gray-900">{seller.followingCount ?? 0}</p>
              <p className="text-xs text-gray-500">seguindo</p>
            </div>
          </div>

          {!isSelf && (
            <button
              type="button"
              onClick={handleFollow}
              disabled={followLoading || isBlocked}
              className={`mt-4 px-6 py-2 rounded-xl text-sm font-medium transition disabled:opacity-50 ${
                following
                  ? 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                  : 'bg-brand-600 text-white hover:bg-brand-700'
              }`}
            >
              {following ? 'Seguindo' : 'Seguir'}
            </button>
          )}
        </div>
      </div>

      {/* Listings */}
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Anuncios de {seller.name}</h2>
      {listings.length === 0 ? (
        <p className="text-center py-8 text-gray-500">Nenhum anuncio ativo.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {listings.map((l) => (
            <ListingCard
              key={l.id}
              id={l.id}
              title={l.title}
              price={l.priceBrl ?? l.price ?? 0}
              size={l.size}
              condition={l.condition}
              sellerName={l.seller?.name ?? l.sellerName ?? seller.name}
              imageUrl={l.images?.[0] ? getImageUrl(l.images[0]) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}
