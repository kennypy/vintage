'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiPost } from '@/lib/api';

const METHODS = [
  { value: 'PIX', label: 'PIX' },
  { value: 'CREDIT_CARD', label: 'Cartão de crédito' },
  { value: 'BOLETO', label: 'Boleto' },
] as const;

export default function RetryPaymentPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [method, setMethod] = useState<'PIX' | 'CREDIT_CARD' | 'BOLETO'>('PIX');
  const [installments, setInstallments] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!params?.id) return;
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { method };
      if (method === 'CREDIT_CARD') body.installments = installments;
      await apiPost(`/payments/${params.id}/retry`, body);
      router.replace(`/orders/${params.id}`);
    } catch (err) {
      setError(String(err).slice(0, 200));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-lg p-6">
      <h1 className="mb-2 text-3xl font-bold">Retentar pagamento</h1>
      <p className="mb-6 text-gray-600">Escolha o método para uma nova tentativa.</p>
      <div className="mb-4 space-y-2">
        {METHODS.map((m) => (
          <label
            key={m.value}
            className={`flex cursor-pointer items-center gap-2 rounded-lg p-3 ${
              method === m.value ? 'bg-blue-600 text-white' : 'bg-white'
            }`}
          >
            <input
              type="radio"
              name="method"
              value={m.value}
              checked={method === m.value}
              onChange={() => setMethod(m.value)}
            />
            {m.label}
          </label>
        ))}
      </div>
      {method === 'CREDIT_CARD' && (
        <div className="mb-4">
          <label className="mb-2 block font-semibold">Parcelas</label>
          <input
            type="number"
            min={1}
            max={12}
            className="w-full rounded-lg border border-gray-300 p-3"
            value={installments}
            onChange={(e) => setInstallments(Math.min(12, Math.max(1, Number(e.target.value) || 1)))}
          />
        </div>
      )}
      {error && <p className="mb-4 text-red-600">{error}</p>}
      <button
        onClick={submit}
        disabled={busy}
        className="w-full rounded-lg bg-blue-600 p-3 font-semibold text-white disabled:opacity-50"
      >
        {busy ? 'Criando…' : 'Criar nova tentativa'}
      </button>
    </main>
  );
}
