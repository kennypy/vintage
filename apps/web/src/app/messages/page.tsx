'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiGet } from '@/lib/api';

interface Conversation {
  id: string;
  otherUser: {
    id: string;
    name: string;
    avatarUrl?: string;
  };
  lastMessage?: {
    body: string;
    createdAt: string;
    isOwn: boolean;
  };
  unreadCount: number;
  listing?: {
    id: string;
    title: string;
    imageUrl?: string;
  };
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  if (diffDays === 1) return 'Ontem';
  if (diffDays < 7) {
    return date.toLocaleDateString('pt-BR', { weekday: 'short' });
  }
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export default function MessagesPage() {
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token =
      typeof window !== 'undefined' ? localStorage.getItem('vintage_token') : null;
    if (!token) {
      router.push('/auth/login');
      return;
    }

    apiGet<Conversation[] | { data: Conversation[] }>('/messages/conversations')
      .then((res) => {
        setConversations(Array.isArray(res) ? res : (res.data ?? []));
      })
      .catch(() => {
        setConversations([]);
        setError('Não foi possível carregar os dados. Tente novamente.');
      })
      .finally(() => setLoading(false));
  }, [router]);

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Mensagens</h1>

      {error && <div className="text-center py-8 text-red-500">{error}</div>}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="animate-pulse flex gap-3 p-4 bg-white border border-gray-200 rounded-xl">
              <div className="w-12 h-12 bg-gray-200 rounded-full flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-gray-200 rounded w-1/3" />
                <div className="h-3 bg-gray-200 rounded w-2/3" />
              </div>
            </div>
          ))}
        </div>
      ) : conversations.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-400 text-5xl mb-4">💬</p>
          <p className="text-gray-500">Nenhuma conversa ainda.</p>
          <p className="text-sm text-gray-400 mt-1">
            Suas mensagens com vendedores e compradores aparecerão aqui.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-gray-100 bg-white border border-gray-200 rounded-xl overflow-hidden">
          {conversations.map((conv) => (
            <Link
              key={conv.id}
              href={`/messages/${conv.id}`}
              className="flex gap-3 p-4 hover:bg-gray-50 transition"
            >
              {/* Avatar */}
              <div className="relative flex-shrink-0">
                <div className="relative w-12 h-12 bg-brand-100 rounded-full flex items-center justify-center text-brand-600 font-bold overflow-hidden">
                  {conv.otherUser.avatarUrl ? (
                    <Image
                      src={conv.otherUser.avatarUrl}
                      alt={conv.otherUser.name}
                      width={48}
                      height={48}
                      className="rounded-full object-cover"
                      sizes="48px"
                    />
                  ) : (
                    conv.otherUser.name.charAt(0)
                  )}
                </div>
                {conv.unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-brand-600 text-white text-xs font-bold rounded-full flex items-center justify-center">
                    {conv.unreadCount > 9 ? '9+' : conv.unreadCount}
                  </span>
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5">
                  <p
                    className={`text-sm ${
                      conv.unreadCount > 0
                        ? 'font-bold text-gray-900'
                        : 'font-medium text-gray-900'
                    }`}
                  >
                    {conv.otherUser.name}
                  </p>
                  {conv.lastMessage && (
                    <p className="text-xs text-gray-400 flex-shrink-0 ml-2">
                      {formatTime(conv.lastMessage.createdAt)}
                    </p>
                  )}
                </div>
                {conv.listing && (
                  <p className="text-xs text-brand-600 truncate mb-0.5">
                    {conv.listing.title}
                  </p>
                )}
                {conv.lastMessage && (
                  <p
                    className={`text-xs truncate ${
                      conv.unreadCount > 0 ? 'text-gray-700 font-medium' : 'text-gray-400'
                    }`}
                  >
                    {conv.lastMessage.isOwn ? 'Você: ' : ''}
                    {conv.lastMessage.body}
                  </p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
