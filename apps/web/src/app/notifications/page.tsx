'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiGet, apiPatch, apiPost } from '@/lib/api';

interface AppNotification {
  id: string;
  type: 'order' | 'offer' | 'message' | 'follow' | 'review' | 'system';
  title: string;
  body: string;
  read: boolean;
  data?: Record<string, string>;
  createdAt: string;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  return new Date(iso).toLocaleDateString('pt-BR');
}

const TYPE_ICONS: Record<string, string> = {
  order: 'M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z',
  offer: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  message: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z',
  follow: 'M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z',
  review: 'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z',
  system: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
};

export default function NotificationsPage() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('vintage_token') : null;
    if (!token) {
      router.push('/auth/login');
      return;
    }

    apiGet<{ items: AppNotification[]; unreadCount: number } | AppNotification[]>('/notifications')
      .then((res) => {
        if (Array.isArray(res)) {
          setNotifications(res);
          setUnreadCount(res.filter((n) => !n.read).length);
        } else {
          setNotifications(res.items ?? []);
          setUnreadCount(res.unreadCount ?? 0);
        }
      })
      .catch(() => {
        setNotifications([]);
        setError('Não foi possível carregar os dados. Tente novamente.');
      })
      .finally(() => setLoading(false));
  }, [router]);

  const handleMarkRead = async (id: string) => {
    try {
      await apiPatch(`/notifications/${encodeURIComponent(id)}/read`);
      setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      // silently fail
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await apiPost('/notifications/read-all');
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch {
      // silently fail
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">Notificacoes</h1>
          {unreadCount > 0 && (
            <span className="px-2 py-0.5 bg-brand-600 text-white text-xs font-bold rounded-full">
              {unreadCount}
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={handleMarkAllRead}
            className="text-sm text-brand-600 hover:text-brand-700 font-medium"
          >
            Marcar todas como lidas
          </button>
        )}
      </div>

      {error && <div className="text-center py-8 text-red-500">{error}</div>}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="animate-pulse bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex gap-3">
                <div className="w-10 h-10 bg-gray-200 rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-3/4" />
                  <div className="h-3 bg-gray-200 rounded w-1/2" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : notifications.length === 0 ? (
        <div className="text-center py-16">
          <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          <p className="text-gray-500">Nenhuma notificacao por enquanto.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => !n.read && handleMarkRead(n.id)}
              className={`w-full text-left flex gap-3 p-4 rounded-xl border transition ${
                n.read
                  ? 'bg-white border-gray-200'
                  : 'bg-brand-50 border-brand-200 hover:bg-brand-100'
              }`}
            >
              <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${n.read ? 'bg-gray-100' : 'bg-brand-100'}`}>
                <svg className={`w-5 h-5 ${n.read ? 'text-gray-400' : 'text-brand-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={TYPE_ICONS[n.type] ?? TYPE_ICONS.system} />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <p className={`text-sm ${n.read ? 'text-gray-700' : 'text-gray-900 font-medium'}`}>{n.title}</p>
                  <span className="text-xs text-gray-400 flex-shrink-0">{timeAgo(n.createdAt)}</span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">{n.body}</p>
              </div>
              {!n.read && (
                <div className="w-2 h-2 bg-brand-600 rounded-full flex-shrink-0 mt-2" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
