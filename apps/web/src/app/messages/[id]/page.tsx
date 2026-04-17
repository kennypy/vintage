'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { apiGet, apiPost } from '@/lib/api';
import { formatBRL } from '@/lib/i18n';

interface Message {
  id: string;
  body: string;
  senderId: string;
  createdAt: string;
  isOwn: boolean;
}

interface ConversationDetail {
  id: string;
  otherUser: {
    id: string;
    name: string;
    avatarUrl?: string;
  };
  listing?: {
    id: string;
    title: string;
    imageUrl?: string;
    priceBrl: number;
  };
  messages: Message[];
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ConversationPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [conversation, setConversation] = useState<ConversationDetail | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const token =
      typeof window !== 'undefined' ? localStorage.getItem('vintage_token') : null;
    if (!token) {
      router.push('/auth/login');
      return;
    }

    apiGet<ConversationDetail>(`/messages/conversations/${params.id}/messages`)
      .then((conv) => {
        setConversation(conv);
        setMessages(conv.messages ?? []);
      })
      .catch(() => router.push('/messages'))
      .finally(() => setLoading(false));
  }, [router, params.id]);

  // Poll for new messages every 3 seconds
  useEffect(() => {
    const conversationId = params.id;
    if (!conversationId) return;

    const interval = setInterval(async () => {
      try {
        const conv = await apiGet<ConversationDetail>(
          `/messages/conversations/${conversationId}`,
        );
        const fetched = conv.messages ?? [];
        setMessages((prev) => {
          const prevIds = new Set(prev.map((m) => m.id));
          const hasNew = fetched.some((m) => !prevIds.has(m.id));
          const countChanged = fetched.length !== prev.length;
          if (hasNew || countChanged) {
            return fetched;
          }
          return prev;
        });
      } catch (_err) {
        // Silently ignore polling errors to avoid disrupting the UI
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [params.id]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = messageText.trim();
    if (!text || sending) return;

    setSending(true);
    setMessageText('');

    const optimistic: Message = {
      id: `temp-${Date.now()}`,
      body: text,
      senderId: 'me',
      createdAt: new Date().toISOString(),
      isOwn: true,
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      const sent = await apiPost<Message>(
        `/messages/conversations/${params.id}/messages`,
        { body: text },
      );
      setMessages((prev) =>
        prev.map((m) => (m.id === optimistic.id ? sent : m)),
      );
    } catch (_err) {
      // remove optimistic message on failure
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setMessageText(text);
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-40" />
          <div className="bg-white border border-gray-200 rounded-xl h-96" />
        </div>
      </div>
    );
  }

  if (!conversation) return null;

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col" style={{ height: 'calc(100vh - 8rem)' }}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <Link href="/messages" className="text-sm text-brand-600 hover:text-brand-700">
          ←
        </Link>
        <div className="relative w-9 h-9 bg-brand-100 rounded-full flex items-center justify-center text-brand-600 font-bold overflow-hidden flex-shrink-0">
          {conversation.otherUser.avatarUrl ? (
            <Image
              src={conversation.otherUser.avatarUrl}
              alt={conversation.otherUser.name}
              width={36}
              height={36}
              className="rounded-full object-cover"
              sizes="36px"
            />
          ) : (
            conversation.otherUser.name.charAt(0)
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900">{conversation.otherUser.name}</p>
          {conversation.listing && (
            <Link
              href={`/listings/${conversation.listing.id}`}
              className="text-xs text-brand-600 truncate block hover:text-brand-700"
            >
              {conversation.listing.title} · {formatBRL(conversation.listing.priceBrl)}
            </Link>
          )}
        </div>
      </div>

      {/* Listing thumbnail */}
      {conversation.listing?.imageUrl && (
        <Link
          href={`/listings/${conversation.listing.id}`}
          className="flex gap-3 bg-gray-50 border border-gray-200 rounded-xl p-3 mb-4 hover:bg-gray-100 transition"
        >
          <Image
            src={conversation.listing.imageUrl}
            alt={conversation.listing.title}
            width={48}
            height={48}
            className="rounded-lg object-cover flex-shrink-0"
            sizes="48px"
          />
          <div>
            <p className="text-xs font-medium text-gray-900 line-clamp-1">
              {conversation.listing.title}
            </p>
            <p className="text-xs text-brand-600 font-semibold mt-0.5">
              {formatBRL(conversation.listing.priceBrl)}
            </p>
          </div>
        </Link>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-3 pb-4">
        {messages.length === 0 ? (
          <p className="text-center text-sm text-gray-400 py-8">
            Nenhuma mensagem ainda. Diga olá!
          </p>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.isOwn ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[75%] px-4 py-2 rounded-2xl text-sm ${
                  msg.isOwn
                    ? 'bg-brand-600 text-white rounded-tr-sm'
                    : 'bg-gray-100 text-gray-900 rounded-tl-sm'
                }`}
              >
                <p>{msg.body}</p>
                <p
                  className={`text-xs mt-1 ${
                    msg.isOwn ? 'text-brand-200' : 'text-gray-400'
                  }`}
                >
                  {formatTime(msg.createdAt)}
                </p>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSend} className="flex gap-2 pt-3 border-t border-gray-200">
        <input
          type="text"
          value={messageText}
          onChange={(e) => setMessageText(e.target.value)}
          placeholder="Digite uma mensagem..."
          className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent"
          disabled={sending}
        />
        <button
          type="submit"
          disabled={!messageText.trim() || sending}
          className="px-4 py-2.5 bg-brand-600 text-white rounded-xl font-medium text-sm hover:bg-brand-700 transition disabled:opacity-50"
        >
          Enviar
        </button>
      </form>
    </div>
  );
}
