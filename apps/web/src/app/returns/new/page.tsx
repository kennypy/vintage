'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiPost } from '@/lib/api';

const REASONS = [
  { value: 'NOT_AS_DESCRIBED', label: 'Não corresponde ao anúncio' },
  { value: 'DAMAGED', label: 'Item danificado' },
  { value: 'COUNTERFEIT', label: 'Item falsificado' },
  { value: 'NOT_RECEIVED', label: 'Não recebi o item' },
  { value: 'WRONG_ITEM', label: 'Item errado' },
];

function NewReturnForm() {
  const router = useRouter();
  const params = useSearchParams();
  const orderId = params.get('orderId') ?? '';
  const [reason, setReason] = useState('NOT_AS_DESCRIBED');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderId) {
      setError('orderId ausente na URL');
      return;
    }
    if (description.trim().length < 10) {
      setError('Descreva o problema com ao menos 10 caracteres.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await apiPost<{ id: string }>('/returns', {
        orderId,
        reason,
        description: description.trim(),
      });
      router.replace(`/returns/${res.id}`);
    } catch (err) {
      setError(String(err).slice(0, 200));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="mb-6 text-3xl font-bold">Solicitar devolução</h1>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="mb-2 block font-semibold">Motivo</label>
          <div className="space-y-2">
            {REASONS.map((r) => (
              <label key={r.value} className="flex items-center gap-2 rounded-lg bg-white p-3">
                <input
                  type="radio"
                  name="reason"
                  value={r.value}
                  checked={reason === r.value}
                  onChange={() => setReason(r.value)}
                />
                {r.label}
              </label>
            ))}
          </div>
        </div>
        <div>
          <label className="mb-2 block font-semibold">Descrição</label>
          <textarea
            className="w-full rounded-lg border border-gray-300 p-3"
            rows={5}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Descreva o problema (mín. 10 caracteres)"
          />
        </div>
        {error && <p className="text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-blue-600 p-3 font-semibold text-white disabled:opacity-50"
        >
          {busy ? 'Enviando…' : 'Enviar solicitação'}
        </button>
      </form>
    </main>
  );
}

export default function NewReturnPage() {
  return (
    <Suspense fallback={<p className="p-6 text-gray-500">Carregando…</p>}>
      <NewReturnForm />
    </Suspense>
  );
}
