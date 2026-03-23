'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import ListingCard from '@/components/ListingCard';
import { apiGet, clearAuthToken } from '@/lib/api';

interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  listings?: number;
  followers?: number;
  following?: number;
}

interface ListingItem {
  id: string;
  title: string;
  price: number;
  size: string;
  condition: string;
  sellerName: string;
  imageUrl?: string;
}

interface WalletBalance {
  balance: number;
}

const tabs = ['Anuncios', 'Compras', 'Vendas', 'Avaliacoes'];

function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [userListings, setUserListings] = useState<ListingItem[]>([]);
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('vintage_token') : null;
    if (!token) {
      router.push('/auth/login');
      return;
    }

    Promise.all([
      apiGet<UserProfile>('/users/me').catch(() => null),
      apiGet<WalletBalance>('/wallet/balance').catch(() => null),
    ])
      .then(([profileData, walletData]) => {
        if (!profileData) {
          clearAuthToken();
          router.push('/auth/login');
          return;
        }
        setUser(profileData);
        if (walletData) {
          setWalletBalance(walletData.balance ?? 0);
        }

        return apiGet<{ data: ListingItem[] } | ListingItem[]>(
          `/listings?sellerId=${encodeURIComponent(profileData.id)}`
        ).catch(() => []);
      })
      .then((listingsData) => {
        if (listingsData) {
          const items = Array.isArray(listingsData)
            ? listingsData
            : (listingsData as { data: ListingItem[] }).data ?? [];
          setUserListings(items);
        }
      })
      .finally(() => {
        setLoading(false);
      });
  }, [router]);

  const handleLogout = () => {
    clearAuthToken();
    router.push('/');
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="animate-pulse">
          <div className="bg-white border border-gray-200 rounded-xl p-6 mb-8">
            <div className="flex items-center gap-6">
              <div className="w-20 h-20 bg-gray-200 rounded-full" />
              <div className="flex-1 space-y-3">
                <div className="h-6 bg-gray-200 rounded w-40" />
                <div className="h-4 bg-gray-200 rounded w-32" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* User info card */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-8">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
          <div className="w-20 h-20 bg-brand-100 rounded-full flex items-center justify-center text-brand-600 font-bold text-2xl">
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt={user.name} className="w-full h-full rounded-full object-cover" />
            ) : (
              user.name.charAt(0)
            )}
          </div>
          <div className="flex-1 text-center sm:text-left">
            <h1 className="text-xl font-bold text-gray-900">{user.name}</h1>
            <p className="text-sm text-gray-500 mb-4">{user.email}</p>

            {/* Stats */}
            <div className="flex justify-center sm:justify-start gap-6">
              <div className="text-center">
                <p className="text-lg font-bold text-gray-900">{user.listings ?? userListings.length}</p>
                <p className="text-xs text-gray-500">Anuncios</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-gray-900">{user.followers ?? 0}</p>
                <p className="text-xs text-gray-500">Seguidores</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-gray-900">{user.following ?? 0}</p>
                <p className="text-xs text-gray-500">Seguindo</p>
              </div>
            </div>
          </div>

          {/* Wallet + Logout */}
          <div className="flex flex-col items-center gap-3">
            <div className="bg-gray-50 rounded-xl p-4 text-center min-w-[160px]">
              <p className="text-xs text-gray-500 mb-1">Saldo da carteira</p>
              <p className="text-xl font-bold text-pix">{formatBRL(walletBalance)}</p>
            </div>
            <button
              onClick={handleLogout}
              className="text-sm text-red-600 hover:text-red-700 transition"
            >
              Sair da conta
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <div className="flex gap-6 overflow-x-auto">
          {tabs.map((tab, index) => (
            <button
              key={tab}
              className={`pb-3 text-sm font-medium border-b-2 whitespace-nowrap transition ${
                index === 0
                  ? 'border-brand-600 text-brand-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Listing grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
        {userListings.map((listing) => (
          <ListingCard key={listing.id} {...listing} />
        ))}
        {userListings.length === 0 && (
          <p className="col-span-full text-center text-gray-500 py-8">
            Nenhum anuncio publicado ainda.
          </p>
        )}
      </div>
    </div>
  );
}
