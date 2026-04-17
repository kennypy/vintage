'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiGet, clearAuthToken } from '@/lib/api';

// The authenticated account surface moved to /conta/*.
// Public profile view lives at /seller/[id]. This page redirects users to
// the public view of their own profile, or to the account settings if the
// user just wants to manage preferences.
export default function ProfilePage() {
  const router = useRouter();

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('vintage_token') : null;
    if (!token) {
      router.replace('/auth/login');
      return;
    }
    apiGet<{ id: string }>('/users/me')
      .then((me) => {
        router.replace(`/seller/${encodeURIComponent(me.id)}`);
      })
      .catch(() => {
        clearAuthToken();
        router.replace('/auth/login');
      });
  }, [router]);

  return (
    <div className="max-w-3xl mx-auto px-4 py-12 text-center text-sm text-gray-500">
      Redirecionando para o seu perfil…
    </div>
  );
}
