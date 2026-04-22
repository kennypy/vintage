'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import { apiGet, apiPost } from '@/lib/api';

interface TicketMessage {
  id: string;
  ticketId: string;
  senderId: string;
  senderRole: 'user' | 'agent';
  senderDisplayName?: string | null;
  body: string;
  attachmentUrls?: string[];
  createdAt: string;
}

interface TicketDetail {
  id: string;
  subject: string;
  body: string;
  status: string;
  category: string;
  priority: string;
  createdAt: string;
  resolvedAt: string | null;
  orderId: string | null;
  messages: TicketMessage[];
  user: { id: string; name: string; email: string };
  order: { id: string; status: string } | null;
}

const STATUS_LABELS: Record<string, string> = {
  OPEN: 'Aberto',
  IN_PROGRESS: 'Em andamento',
  RESOLVED: 'Resolvido',
  CLOSED: 'Fechado',
};

const CATEGORY_LABELS: Record<string, string> = {
  ORDER_ISSUE: 'Problema com pedido',
  PAYMENT: 'Pagamento',
  SHIPPING: 'Envio',
  REFUND: 'Reembolso',
  ACCOUNT: 'Conta',
  LISTING: 'Anúncio',
  FRAUD: 'Fraude',
  OTHER: 'Outro',
};

export default function SupportTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    apiGet<TicketDetail>(`/support/tickets/${encodeURIComponent(id)}`)
      .then(setTicket)
      .catch(() => setTicket(null))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const send = async () => {
    if (!reply.trim()) return;
    setSending(true);
    setError(null);
    try {
      await apiPost(`/support/tickets/${encodeURIComponent(id)}/reply`, {
        body: reply.trim(),
      });
      setReply('');
      load();
    } catch (e) {
      setError(String(e).slice(0, 200));
    } finally {
      setSending(false);
    }
  };

  if (loading) return <p className="p-6 text-gray-500">Carregando…</p>;
  if (!ticket) return <p className="p-6 text-gray-500">Ticket não encontrado.</p>;

  const closed = ticket.status === 'RESOLVED' || ticket.status === 'CLOSED';

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-bold">{ticket.subject}</h1>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-700">
          {STATUS_LABELS[ticket.status] ?? ticket.status}
        </span>
        <span className="text-gray-500">
          {CATEGORY_LABELS[ticket.category] ?? ticket.category} ·{' '}
          {new Date(ticket.createdAt).toLocaleDateString('pt-BR')}
        </span>
      </div>

      <div className="mt-6 space-y-3">
        <Bubble role="user" body={ticket.body} at={ticket.createdAt} />
        {ticket.messages.map((m) => (
          <Bubble
            key={m.id}
            role={m.senderRole}
            displayName={m.senderDisplayName ?? null}
            body={m.body}
            attachmentUrls={m.attachmentUrls ?? []}
            at={m.createdAt}
          />
        ))}
      </div>

      {closed ? (
        <p className="mt-6 rounded-lg bg-gray-100 p-3 text-center text-sm text-gray-600">
          Este ticket foi {ticket.status === 'RESOLVED' ? 'resolvido' : 'fechado'}. Envie uma nova
          mensagem para reabrir.
        </p>
      ) : null}

      <div className="mt-6 rounded-xl bg-white p-4 shadow-sm">
        <textarea
          className="w-full rounded-lg border border-gray-300 p-3 text-sm"
          rows={4}
          maxLength={5000}
          placeholder="Escreva uma resposta…"
          value={reply}
          onChange={(e) => setReply(e.target.value)}
        />
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <button
          type="button"
          disabled={sending || !reply.trim()}
          onClick={send}
          className="mt-2 w-full rounded-lg bg-brand-600 p-3 font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {sending ? 'Enviando…' : 'Enviar resposta'}
        </button>
      </div>
    </main>
  );
}

function Bubble({
  role,
  displayName,
  body,
  attachmentUrls = [],
  at,
}: {
  role: 'user' | 'agent';
  displayName?: string | null;
  body: string;
  attachmentUrls?: string[];
  at: string;
}) {
  const isAgent = role === 'agent';
  const label = isAgent
    ? displayName
      ? `${displayName} · Suporte Vintage`
      : 'Suporte Vintage'
    : 'Você';
  return (
    <div className={`flex ${isAgent ? 'justify-start' : 'justify-end'}`}>
      <div
        className={`max-w-[85%] rounded-xl p-3 ${
          isAgent ? 'rounded-tl-none bg-brand-50' : 'rounded-tr-none bg-white shadow-sm'
        }`}
      >
        <p className="mb-1 text-xs font-semibold text-gray-500">{label}</p>
        <p className="whitespace-pre-wrap text-sm text-gray-900">{body}</p>
        {attachmentUrls.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {attachmentUrls.map((url) => {
              const isImage = /\.(jpe?g|png|gif|webp)(\?|$)/i.test(url);
              return isImage ? (
                <a
                  key={url}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="relative h-20 w-20 overflow-hidden rounded-lg bg-gray-100"
                >
                  <Image
                    src={url}
                    alt=""
                    fill
                    sizes="80px"
                    className="object-cover"
                    unoptimized
                  />
                </a>
              ) : (
                <a
                  key={url}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700 hover:bg-gray-100"
                >
                  📎 Anexo
                </a>
              );
            })}
          </div>
        )}
        <p className="mt-2 text-[11px] text-gray-400">
          {new Date(at).toLocaleString('pt-BR')}
        </p>
      </div>
    </div>
  );
}
