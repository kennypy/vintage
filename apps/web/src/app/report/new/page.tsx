'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiPost } from '@/lib/api';

type ReportTargetType = 'listing' | 'message' | 'user' | 'review';
type ReportReason = 'spam' | 'counterfeit' | 'inappropriate' | 'fraud' | 'harassment' | 'other';

// Mirrors apps/api/src/reports/dto/create-report.dto.ts — keep in sync.
const REASONS: ReadonlyArray<{ value: ReportReason; label: string; help: string }> = [
  { value: 'spam',          label: 'Spam',                    help: 'Conteúdo repetitivo, propaganda ou links suspeitos.' },
  { value: 'counterfeit',   label: 'Produto falso',            help: 'Anúncio de item replicado vendido como autêntico.' },
  { value: 'inappropriate', label: 'Conteúdo inapropriado',    help: 'Violência, nudez, discurso de ódio.' },
  { value: 'fraud',         label: 'Fraude ou golpe',          help: 'Tentativa de pagamento fora da plataforma, phishing.' },
  { value: 'harassment',    label: 'Assédio ou ameaças',       help: 'Mensagens hostis, stalking, intimidação.' },
  { value: 'other',         label: 'Outro motivo',             help: 'Descreva nos detalhes abaixo.' },
];

const ALLOWED_TYPES = new Set<ReportTargetType>(['listing', 'message', 'user', 'review']);

function ReportFormInner() {
  const router = useRouter();
  const params = useSearchParams();
  const rawType = params.get('targetType') ?? '';
  const targetType = (ALLOWED_TYPES.has(rawType as ReportTargetType)
    ? (rawType as ReportTargetType)
    : 'user') as ReportTargetType;
  const targetId = params.get('targetId') ?? '';

  const [reason, setReason] = useState<ReportReason | null>(null);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  if (!targetId) {
    return (
      <main className="max-w-xl mx-auto px-4 py-12 text-center">
        <p className="text-sm text-red-700 mb-4">Alvo da denúncia não informado.</p>
        <button
          type="button"
          onClick={() => router.back()}
          className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium"
        >
          Voltar
        </button>
      </main>
    );
  }

  if (done) {
    return (
      <main className="max-w-xl mx-auto px-4 py-12 text-center">
        <h1 className="text-xl font-bold text-gray-900 mb-2">Denúncia recebida</h1>
        <p className="text-sm text-gray-600 mb-6">
          Obrigado. Nossa equipe analisará em até 48h.
        </p>
        <button
          type="button"
          onClick={() => router.back()}
          className="px-5 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700"
        >
          Voltar
        </button>
      </main>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!reason) {
      setError('Selecione um motivo.');
      return;
    }
    setSubmitting(true);
    try {
      await apiPost('/reports', {
        targetType,
        targetId,
        reason,
        description: description.trim() || undefined,
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Não foi possível enviar a denúncia.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="max-w-xl mx-auto px-4 py-8">
      <h1 className="text-xl font-bold text-gray-900 mb-2">Denunciar</h1>
      <p className="text-sm text-gray-500 mb-6">
        Denúncias são revisadas pela nossa equipe de moderação. O autor do
        conteúdo não é avisado de quem denunciou.
      </p>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700" role="alert">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <fieldset>
          <legend className="text-xs font-semibold text-gray-600 uppercase mb-2">Motivo</legend>
          <div className="space-y-2">
            {REASONS.map((r) => (
              <label
                key={r.value}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer ${
                  reason === r.value
                    ? 'border-brand-500 bg-brand-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <input
                  type="radio"
                  name="reason"
                  value={r.value}
                  checked={reason === r.value}
                  onChange={() => setReason(r.value)}
                  className="mt-1 text-brand-600"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{r.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{r.help}</p>
                </div>
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <label htmlFor="description" className="block text-xs font-semibold text-gray-600 uppercase mb-2">
            Detalhes (opcional)
          </label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
            rows={4}
            placeholder="Links, capturas de tela, contexto adicional…"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-y"
          />
          <p className="text-xs text-gray-400 mt-1 text-right">{description.length}/500</p>
        </div>

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={submitting || !reason}
            className="px-5 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-40"
          >
            {submitting ? 'Enviando...' : 'Enviar denúncia'}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="px-5 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50"
          >
            Cancelar
          </button>
        </div>
      </form>
    </main>
  );
}

export default function ReportNewPage() {
  return (
    <Suspense fallback={<main className="max-w-xl mx-auto px-4 py-8"><p>Carregando…</p></main>}>
      <ReportFormInner />
    </Suspense>
  );
}
