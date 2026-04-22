'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiGet, apiPost } from '@/lib/api';

interface Ticket {
  id: string;
  subject: string;
  status: string;
  category: string;
  priority: string;
  createdAt: string;
}

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

const STATUS_LABELS: Record<string, string> = {
  OPEN: 'Aberto',
  IN_PROGRESS: 'Em andamento',
  RESOLVED: 'Resolvido',
  CLOSED: 'Fechado',
};

export default function SupportPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState('OTHER');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = () =>
    apiGet<{ items: Ticket[] }>('/support/tickets')
      .then((r) => setTickets(r.items))
      .catch(() => setTickets([]));

  useEffect(() => {
    refresh();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiPost('/support/tickets', { subject: subject.trim(), body: body.trim(), category });
      setSubject('');
      setBody('');
      setCategory('OTHER');
      await refresh();
    } catch (err) {
      setError(String(err).slice(0, 200));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="mb-2 text-3xl font-bold">Suporte</h1>
      <p className="mb-6 text-gray-600">
        Conte o que aconteceu e nossa equipe responde em até 1 dia útil.
      </p>

      <form onSubmit={submit} className="mb-8 space-y-3 rounded-xl bg-white p-5 shadow-sm">
        <select
          className="w-full rounded-lg border border-gray-300 p-3"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          {Object.entries(CATEGORY_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <input
          className="w-full rounded-lg border border-gray-300 p-3"
          placeholder="Assunto"
          maxLength={200}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />
        <textarea
          className="w-full rounded-lg border border-gray-300 p-3"
          rows={6}
          placeholder="Descreva o problema com o maior número possível de detalhes (número do pedido, datas, etc)"
          maxLength={5000}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        {error && <p className="text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-brand-600 p-3 font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {submitting ? 'Enviando…' : 'Abrir ticket'}
        </button>
      </form>

      <h2 className="mb-3 text-lg font-bold">Meus tickets</h2>
      {tickets.length === 0 ? (
        <p className="text-gray-500">Nenhum ticket aberto.</p>
      ) : (
        <ul className="space-y-2">
          {tickets.map((t) => (
            <li key={t.id}>
              <Link
                href={`/conta/suporte/${t.id}`}
                className="block rounded-xl bg-white p-4 shadow-sm hover:shadow-md"
              >
                <div className="flex items-center justify-between">
                  <p className="font-semibold">{t.subject}</p>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs">
                    {STATUS_LABELS[t.status] ?? t.status}
                  </span>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  {CATEGORY_LABELS[t.category] ?? t.category} · {new Date(t.createdAt).toLocaleDateString('pt-BR')}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
