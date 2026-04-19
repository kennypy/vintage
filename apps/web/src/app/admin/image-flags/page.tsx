'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiGet, apiPatch } from '@/lib/api';

/**
 * Admin queue for SafeSearch image flags (`status='PENDING'`).
 * Shipped by commit 09cada2: Google Vision flags LIKELY-rated
 * adult/violence/racy uploads into ListingImageFlag. This page
 * gives ops a way to triage them instead of relying on direct
 * psql inspection.
 *
 * Actions:
 *   DISMISS — false positive; flag resolved, image stays live
 *   REJECT  — removes every ListingImage row pointing at the URL,
 *             suspends the affected listings, syncs them out of
 *             Meilisearch. Underlying S3 object is not deleted
 *             here (that's the RetentionCron's job once the
 *             listing has been DELETED long enough).
 */

interface Finding {
  adult?: string;
  violence?: string;
  racy?: string;
  spoof?: string;
  medical?: string;
}

interface ImageFlag {
  id: string;
  imageUrl: string;
  s3Key: string;
  reason: string;
  status: 'PENDING' | 'DISMISSED' | 'REJECTED';
  findings: Finding;
  createdAt: string;
  uploader: {
    id: string;
    name: string;
    email: string;
  };
}

interface Paginated {
  items: ImageFlag[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

const LIKELIHOOD_STYLE: Record<string, string> = {
  VERY_UNLIKELY: 'bg-gray-100 text-gray-600',
  UNLIKELY: 'bg-gray-100 text-gray-600',
  POSSIBLE: 'bg-yellow-100 text-yellow-800',
  LIKELY: 'bg-orange-100 text-orange-800',
  VERY_LIKELY: 'bg-red-100 text-red-800',
  UNKNOWN: 'bg-gray-100 text-gray-400',
};

function Likelihood({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  const style = LIKELIHOOD_STYLE[value] ?? LIKELIHOOD_STYLE.UNKNOWN;
  return (
    <span className={`inline-block text-xs px-2 py-0.5 rounded-full mr-1 mb-1 ${style}`}>
      {label}: {value.toLowerCase().replace('_', ' ')}
    </span>
  );
}

export default function AdminImageFlagsPage() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paginated | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await apiGet<Paginated>(
        `/moderation/image-flags?page=${page}&pageSize=20`,
      );
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar sinalizações.');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    load();
  }, [load]);

  const resolve = async (flag: ImageFlag, action: 'DISMISS' | 'REJECT') => {
    const confirmMsg =
      action === 'REJECT'
        ? `Rejeitar imagem? Isso remove a imagem de todos os anúncios que a usam e suspende os anúncios afetados.`
        : 'Dispensar esta sinalização como falso positivo?';
    if (!window.confirm(confirmMsg)) return;

    setBusyId(flag.id);
    setError('');
    setNotice('');
    try {
      await apiPatch(`/moderation/image-flags/${flag.id}`, { action });
      setNotice(
        action === 'REJECT'
          ? 'Imagem rejeitada e anúncios suspensos.'
          : 'Sinalização dispensada.',
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao resolver sinalização.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Moderação de imagens</h1>
        <nav className="text-sm">
          <Link href="/admin/moderation" className="text-brand-600 hover:underline mr-4">
            Denúncias
          </Link>
          <Link href="/admin/image-flags" className="text-gray-900 font-medium underline">
            Imagens sinalizadas
          </Link>
        </nav>
      </div>

      <p className="text-sm text-gray-600 mb-4">
        Uploads em que o Google Vision SafeSearch retornou{' '}
        <strong>LIKELY</strong> em adulto / violência / sugestivo. Uploads
        com <strong>VERY_LIKELY</strong> são rejeitados antes de chegarem
        ao S3 e não aparecem aqui.
      </p>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          {error}
        </div>
      )}
      {notice && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-800">
          {notice}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Carregando…</p>
      ) : !data || data.items.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
          <p className="text-gray-600">Fila vazia. Nenhuma imagem aguardando revisão.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {data.items.map((flag) => (
            <div key={flag.id} className="bg-white border border-gray-200 rounded-xl p-4 flex gap-4">
              <div className="w-40 h-40 flex-shrink-0 bg-gray-100 rounded-lg overflow-hidden">
                {/* Plain <img> is correct here: Next's <Image> requires
                    the remote host on the allowlist, and admin-triage
                    images can come from any configured bucket. The
                    size is fixed by the container so layout shift
                    isn't a concern. */}
                <img
                  src={flag.imageUrl}
                  alt="Imagem sinalizada"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm text-gray-900 font-medium">{flag.reason}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      Enviado por{' '}
                      <Link
                        href={`/admin/users?search=${encodeURIComponent(flag.uploader.email)}`}
                        className="text-brand-600 hover:underline"
                      >
                        {flag.uploader.name || flag.uploader.email}
                      </Link>{' '}
                      em {new Date(flag.createdAt).toLocaleString('pt-BR')}
                    </p>
                  </div>
                </div>

                <div className="mt-2">
                  <Likelihood label="Adulto" value={flag.findings?.adult} />
                  <Likelihood label="Violência" value={flag.findings?.violence} />
                  <Likelihood label="Sugestivo" value={flag.findings?.racy} />
                  <Likelihood label="Meme" value={flag.findings?.spoof} />
                  <Likelihood label="Médico" value={flag.findings?.medical} />
                </div>

                <p className="text-xs text-gray-400 mt-2 break-all">
                  S3: <code>{flag.s3Key}</code>
                </p>

                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => resolve(flag, 'DISMISS')}
                    disabled={busyId === flag.id}
                    className="px-4 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg disabled:opacity-50"
                  >
                    Dispensar (falso positivo)
                  </button>
                  <button
                    type="button"
                    onClick={() => resolve(flag, 'REJECT')}
                    disabled={busyId === flag.id}
                    className="px-4 py-1.5 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg disabled:opacity-50"
                  >
                    Rejeitar e suspender anúncios
                  </button>
                </div>
              </div>
            </div>
          ))}

          <div className="flex items-center justify-between mt-6">
            <p className="text-sm text-gray-500">
              Página {data.page} — {data.total} sinalizações pendentes
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 text-sm border border-gray-300 rounded-lg disabled:opacity-50"
              >
                Anterior
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => p + 1)}
                disabled={!data.hasMore}
                className="px-3 py-1 text-sm border border-gray-300 rounded-lg disabled:opacity-50"
              >
                Próxima
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
