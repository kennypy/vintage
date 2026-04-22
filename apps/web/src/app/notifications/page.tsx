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

interface NotificationPreferences {
  pushEnabled: boolean;
  emailEnabled: boolean;
  orders: boolean;
  messages: boolean;
  offers: boolean;
  followers: boolean;
  priceDrops: boolean;
  promotions: boolean;
  news: boolean;
  reviews: boolean;
  favorites: boolean;
  dailyCap: number;
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

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        value ? 'bg-brand-600' : 'bg-gray-200'
      }`}
      aria-pressed={value}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          value ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

// Defaults MUST match the backend schema (apps/api/prisma/schema.prisma
// User.notif* columns): every category is on by default so a fresh
// install stays in sync with a fresh DB row. Previously the web
// silently pinned promotions+news to false, which looked like the
// account had them off even though the DB had them on — the first
// PATCH from any other toggle would persist the false value. Keep the
// whole shape aligned across mobile, web, and DB.
const DEFAULT_PREFS: NotificationPreferences = {
  pushEnabled: true,
  emailEnabled: true,
  orders: true,
  messages: true,
  offers: true,
  followers: true,
  priceDrops: true,
  promotions: true,
  news: true,
  reviews: true,
  favorites: true,
  dailyCap: 0,
};

const DAILY_CAP_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 0, label: 'Sem limite' },
  { value: 2, label: 'Até 2 por dia' },
  { value: 5, label: 'Até 5 por dia' },
  { value: 10, label: 'Até 10 por dia' },
];

type Tab = 'all' | 'unread' | 'preferences';

export default function NotificationsPage() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [tab, setTab] = useState<Tab>('all');

  const [prefs, setPrefs] = useState<NotificationPreferences>(DEFAULT_PREFS);
  const [prefsSaving, setPrefsSaving] = useState(false);
  const [prefsSaved, setPrefsSaved] = useState(false);
  const [prefsError, setPrefsError] = useState<string | null>(null);

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

    apiGet<NotificationPreferences>('/users/me/notification-preferences')
      .then((res) => setPrefs({ ...DEFAULT_PREFS, ...res }))
      .catch(() => {
        // Fallback to defaults — endpoint is optional.
      });
  }, [router]);

  const handleMarkRead = async (id: string) => {
    const before = notifications;
    const beforeCount = unreadCount;
    // Optimistic update first.
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
    setUnreadCount((c) => Math.max(0, c - 1));
    try {
      await apiPatch(`/notifications/${encodeURIComponent(id)}/read`);
    } catch (err) {
      // Revert and surface — the top-level `error` banner renders in every tab.
      setNotifications(before);
      setUnreadCount(beforeCount);
      setError(
        err instanceof Error && err.message
          ? err.message
          : 'Não foi possível marcar como lida. Tente novamente.',
      );
    }
  };

  const handleMarkAllRead = async () => {
    const before = notifications;
    const beforeCount = unreadCount;
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
    try {
      await apiPost('/notifications/read-all');
    } catch (err) {
      setNotifications(before);
      setUnreadCount(beforeCount);
      setError(
        err instanceof Error && err.message
          ? err.message
          : 'Não foi possível marcar todas como lidas.',
      );
    }
  };

  const updatePref = async (patch: Partial<NotificationPreferences>) => {
    const previous = prefs;
    const nextPrefs = { ...prefs, ...patch };
    setPrefs(nextPrefs);
    setPrefsSaving(true);
    setPrefsError(null);
    try {
      await apiPatch('/users/me/notification-preferences', patch);
      setPrefsSaved(true);
      setTimeout(() => setPrefsSaved(false), 1500);
    } catch (err) {
      // Revert the optimistic toggle so the UI reflects real server state.
      setPrefs(previous);
      setPrefsError(
        err instanceof Error && err.message
          ? err.message
          : 'Não foi possível salvar a preferência. Tente novamente.',
      );
    } finally {
      setPrefsSaving(false);
    }
  };

  const visibleNotifications = tab === 'unread'
    ? notifications.filter((n) => !n.read)
    : notifications;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">Notificações</h1>
          {unreadCount > 0 && (
            <span className="px-2 py-0.5 bg-brand-600 text-white text-xs font-bold rounded-full">
              {unreadCount}
            </span>
          )}
        </div>
        {unreadCount > 0 && tab !== 'preferences' && (
          <button
            type="button"
            onClick={handleMarkAllRead}
            className="text-sm text-brand-600 hover:text-brand-700 font-medium"
          >
            Marcar todas como lidas
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <div className="flex gap-6">
          {([
            { key: 'all', label: 'Todas' },
            { key: 'unread', label: 'Não lidas' },
            { key: 'preferences', label: 'Preferências' },
          ] as const).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`pb-3 text-sm font-medium border-b-2 transition ${
                tab === t.key
                  ? 'border-brand-600 text-brand-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="text-center py-8 text-red-500">{error}</div>}

      {tab === 'preferences' ? (
        <div className="space-y-4">
          {prefsSaved && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
              Preferências atualizadas.
            </div>
          )}
          {prefsError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700" role="alert">
              {prefsError}
            </div>
          )}

          <section className="bg-white border border-gray-200 rounded-xl p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4">Canais</h2>
            <div className="divide-y divide-gray-100">
              <PrefRow label="Notificações push" hint="No navegador e dispositivos">
                <Toggle value={prefs.pushEnabled} onChange={(v) => updatePref({ pushEnabled: v })} />
              </PrefRow>
              <PrefRow label="Notificações por e-mail">
                <Toggle value={prefs.emailEnabled} onChange={(v) => updatePref({ emailEnabled: v })} />
              </PrefRow>
            </div>
          </section>

          <section className="bg-white border border-gray-200 rounded-xl p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4">Categorias</h2>
            <div className="divide-y divide-gray-100">
              <PrefRow label="Mensagens" hint="Novas mensagens de compradores e vendedores">
                <Toggle value={prefs.messages} onChange={(v) => updatePref({ messages: v })} />
              </PrefRow>
              <PrefRow label="Pedidos" hint="Pagamento, envio e entrega">
                <Toggle value={prefs.orders} onChange={(v) => updatePref({ orders: v })} />
              </PrefRow>
              <PrefRow label="Ofertas" hint="Propostas recebidas e respostas">
                <Toggle value={prefs.offers} onChange={(v) => updatePref({ offers: v })} />
              </PrefRow>
              <PrefRow label="Avaliações" hint="Quando um comprador avalia sua venda">
                <Toggle value={prefs.reviews} onChange={(v) => updatePref({ reviews: v })} />
              </PrefRow>
              <PrefRow label="Queda de preço" hint="Favoritos com preço reduzido">
                <Toggle value={prefs.priceDrops} onChange={(v) => updatePref({ priceDrops: v })} />
              </PrefRow>
              <PrefRow label="Favoritos e novos itens" hint="Quando alguém favorita seu anúncio ou chegam itens das suas buscas salvas">
                <Toggle value={prefs.favorites} onChange={(v) => updatePref({ favorites: v })} />
              </PrefRow>
              <PrefRow label="Novos seguidores">
                <Toggle value={prefs.followers} onChange={(v) => updatePref({ followers: v })} />
              </PrefRow>
              <PrefRow label="Promoções" hint="Destaque, Impulso e campanhas">
                <Toggle value={prefs.promotions} onChange={(v) => updatePref({ promotions: v })} />
              </PrefRow>
              <PrefRow label="Novidades do Vintage.br">
                <Toggle value={prefs.news} onChange={(v) => updatePref({ news: v })} />
              </PrefRow>
            </div>
          </section>

          <section className="bg-white border border-gray-200 rounded-xl p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-2">Limite diário</h2>
            <p className="text-sm text-gray-600 mb-4">
              Pushes por categoria por dia. Acima do limite, a entrada
              ainda aparece na sineta, mas sem alerta no dispositivo.
            </p>
            <select
              value={prefs.dailyCap}
              onChange={(e) => updatePref({ dailyCap: Number(e.target.value) })}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm bg-white"
              aria-label="Limite diário de notificações"
            >
              {DAILY_CAP_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </section>

          <section className="bg-white border border-gray-200 rounded-xl p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-2">
              Configurações do sistema
            </h2>
            <p className="text-sm text-gray-600">
              Se o navegador ou o sistema operacional estiver bloqueando
              notificações, você precisa ajustar essa permissão
              diretamente nas configurações do navegador — os toggles
              acima só controlam o que o Vintage.br tenta enviar.
            </p>
          </section>

          {prefsSaving && (
            <p className="text-xs text-gray-400 text-center">Salvando…</p>
          )}
        </div>
      ) : loading ? (
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
      ) : visibleNotifications.length === 0 ? (
        <div className="text-center py-16">
          <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          <p className="text-gray-500">
            {tab === 'unread' ? 'Nenhuma notificação não lida.' : 'Nenhuma notificação por enquanto.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {visibleNotifications.map((n) => (
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

function PrefRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
      <div>
        <p className="text-sm font-medium text-gray-700">{label}</p>
        {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
      </div>
      <div className="ml-4 flex-shrink-0">{children}</div>
    </div>
  );
}
