'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiGet, apiPost } from '@/lib/api';

interface SecurityStatus {
  cpfChecksumValid?: boolean;
  cpfIdentityVerified?: boolean;
  // Back-compat alias the API still emits.
  cpfVerified?: boolean;
  twoFaEnabled?: boolean;
  isContaProtegida?: boolean;
}

interface VerifyResponse {
  status:
    | 'VERIFIED'
    | 'NAME_MISMATCH'
    | 'CPF_SUSPENDED'
    | 'CPF_CANCELED'
    | 'DECEASED'
    | 'PROVIDER_ERROR'
    | 'CONFIG_ERROR';
  identityVerified: boolean;
  message: string;
}

export default function VerificacaoPage() {
  const router = useRouter();
  const [status, setStatus] = useState<SecurityStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [birthDate, setBirthDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<{
    kind: 'success' | 'info' | 'error';
    text: string;
  } | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('vintage_token')) {
      router.push('/auth/login');
      return;
    }
    apiGet<SecurityStatus>('/auth/security-status')
      .then((data) => setStatus(data))
      .catch(() => setStatus({}))
      .finally(() => setLoading(false));
  }, [router]);

  const verified = status?.cpfIdentityVerified === true;

  // Track-C escalation: exposed after a Serpro attempt returned
  // NAME_MISMATCH / CPF_SUSPENDED. Doc+liveness can disambiguate
  // name/DOB mismatches a first-line API can't.
  const [showDocEscalation, setShowDocEscalation] = useState(false);
  const [docSubmitting, setDocSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!birthDate) return;
    setSubmitting(true);
    setNotice(null);
    setShowDocEscalation(false);
    try {
      const result = await apiPost<VerifyResponse>(
        '/users/me/verify-identity',
        { birthDate },
      );
      if (result.status === 'VERIFIED') {
        setStatus({ ...status, cpfIdentityVerified: true });
        setNotice({ kind: 'success', text: result.message });
      } else if (result.status === 'CONFIG_ERROR') {
        setNotice({ kind: 'info', text: result.message });
      } else {
        setNotice({ kind: 'error', text: result.message });
        if (
          result.status === 'NAME_MISMATCH' ||
          result.status === 'CPF_SUSPENDED'
        ) {
          setShowDocEscalation(true);
        }
      }
    } catch (err) {
      setNotice({
        kind: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Não foi possível verificar agora. Tente novamente.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDocEscalation = async () => {
    setDocSubmitting(true);
    try {
      const result = await apiPost<{ redirectUrl: string | null; reason?: string }>(
        '/users/me/verify-identity-document',
      );
      if (result.redirectUrl) {
        // Defence in depth: the API is expected to return a vetted Caf URL,
        // but never hand an unknown scheme to window.open — javascript:/data:/
        // blob: all execute in the current origin's context. Require https://.
        let parsed: URL;
        try {
          parsed = new URL(result.redirectUrl);
        } catch {
          setNotice({ kind: 'error', text: 'URL de verificação inválida. Tente novamente.' });
          setDocSubmitting(false);
          return;
        }
        if (parsed.protocol !== 'https:') {
          setNotice({ kind: 'error', text: 'URL de verificação inválida. Tente novamente.' });
          setDocSubmitting(false);
          return;
        }
        window.open(parsed.toString(), '_blank', 'noopener,noreferrer');
        setNotice({
          kind: 'info',
          text: 'Abrimos o fluxo de verificação por documento em uma nova aba. Volte aqui depois de concluir.',
        });
        setShowDocEscalation(false);
      } else {
        setNotice({
          kind: 'error',
          text:
            result.reason ??
            'Não foi possível iniciar a verificação por documento.',
        });
      }
    } catch (err) {
      setNotice({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Falha ao iniciar verificação.',
      });
    } finally {
      setDocSubmitting(false);
    }
  };

  if (loading) {
    return <div className="p-6 text-sm text-gray-500">Carregando…</div>;
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Verificação de identidade</h1>
      <p className="text-sm text-gray-600 mb-6">
        Confirmamos seu CPF, nome e data de nascimento diretamente com a
        Receita Federal. A verificação é obrigatória para solicitar saques
        e emitir notas fiscais.
      </p>

      <section className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-700">Status</span>
          {verified ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-0.5 rounded-full bg-green-100 text-green-800">
              ✓ Verificado
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-0.5 rounded-full bg-yellow-100 text-yellow-800">
              Pendente
            </span>
          )}
        </div>
      </section>

      {notice && (
        <div
          className={`mb-4 p-3 rounded-xl text-sm border ${
            notice.kind === 'success'
              ? 'bg-green-50 border-green-200 text-green-800'
              : notice.kind === 'info'
                ? 'bg-blue-50 border-blue-200 text-blue-800'
                : 'bg-red-50 border-red-200 text-red-700'
          }`}
          role={notice.kind === 'error' ? 'alert' : 'status'}
        >
          {notice.text}
        </div>
      )}

      {!verified && (
        <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
          <div>
            <label htmlFor="birthDate" className="block text-sm font-medium text-gray-700 mb-1">
              Data de nascimento
            </label>
            <input
              id="birthDate"
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              Os dados precisam conferir exatamente com o cadastro da Receita.
            </p>
          </div>
          <button
            type="submit"
            disabled={submitting || !birthDate}
            className="w-full py-3 bg-brand-600 text-white rounded-xl font-medium hover:bg-brand-700 disabled:opacity-50"
          >
            {submitting ? 'Verificando…' : 'Verificar identidade'}
          </button>
        </form>
      )}

      {!verified && showDocEscalation && (
        <div className="mt-4 bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-2">
            Os dados não conferiram. Quer verificar por documento?
          </h2>
          <p className="text-sm text-gray-600 mb-3">
            Enviamos você a um fluxo seguro do nosso parceiro (selfie +
            RG/CNH). O resultado chega automaticamente aqui.
          </p>
          <button
            type="button"
            onClick={handleDocEscalation}
            disabled={docSubmitting}
            className="px-5 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800 disabled:opacity-50"
          >
            {docSubmitting ? 'Abrindo…' : 'Verificar por documento'}
          </button>
        </div>
      )}

      {verified && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-800">
          Sua identidade está verificada. Saques e emissão de notas fiscais
          estão liberados.
        </div>
      )}

      <div className="mt-6 text-sm text-gray-500 flex gap-4">
        <Link href="/conta/configuracoes" className="hover:underline">← Voltar à conta</Link>
        {!verified && (
          <Link href="/conta/cpf" className="hover:underline">Precisa corrigir seu CPF?</Link>
        )}
      </div>
    </div>
  );
}
