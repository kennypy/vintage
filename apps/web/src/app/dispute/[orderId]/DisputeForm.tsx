'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { apiGet, apiPost, apiPostForm } from '@/lib/api';
import { formatBRL, DISPUTE_REASON_PT } from '@/lib/i18n';

type DisputeReason = 'NOT_RECEIVED' | 'NOT_AS_DESCRIBED' | 'DAMAGED' | 'WRONG_ITEM' | 'COUNTERFEIT';

const REASONS: DisputeReason[] = [
  'NOT_RECEIVED',
  'NOT_AS_DESCRIBED',
  'DAMAGED',
  'WRONG_ITEM',
  'COUNTERFEIT',
];

const MIN_DESCRIPTION_LENGTH = 20;
const MAX_DESCRIPTION_LENGTH = 5000;
const MAX_EVIDENCE_PHOTOS = 5;

interface Order {
  id: string;
  totalBrl?: number;
  total?: number;
  listing?: { title: string; imageUrl?: string };
  item?: { title: string };
  seller?: { name: string };
}

interface UploadedPhoto {
  file: File;
  previewUrl: string;
  uploadedUrl?: string;
  uploading: boolean;
  error?: string | null;
}

export default function DisputeForm({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedReason, setSelectedReason] = useState<DisputeReason | null>(null);
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('vintage_token') : null;
    if (!token) {
      router.push('/auth/login');
      return;
    }
    apiGet<Order>(`/orders/${encodeURIComponent(orderId)}`)
      .then((data) => setOrder(data))
      .catch(() => setError('Não foi possível carregar este pedido.'))
      .finally(() => setLoading(false));
  }, [orderId, router]);

  const addPhotos = async (files: FileList | null) => {
    if (!files) return;
    const available = MAX_EVIDENCE_PHOTOS - photos.length;
    const slice = Array.from(files).slice(0, available);
    const next: UploadedPhoto[] = slice.map((file) => ({
      file,
      previewUrl: URL.createObjectURL(file),
      uploading: true,
      error: null,
    }));
    setPhotos((prev) => [...prev, ...next]);

    // Upload each new photo in parallel.
    await Promise.all(
      next.map(async (photo, i) => {
        const indexOffset = photos.length + i;
        try {
          const formData = new FormData();
          formData.append('file', photo.file);
          const result = await apiPostForm<{ url: string }>('/uploads/listing-image', formData);
          setPhotos((prev) =>
            prev.map((p, idx) => (idx === indexOffset ? { ...p, uploadedUrl: result.url, uploading: false } : p)),
          );
        } catch {
          setPhotos((prev) =>
            prev.map((p, idx) =>
              idx === indexOffset ? { ...p, uploading: false, error: 'Falha no upload' } : p,
            ),
          );
        }
      }),
    );
  };

  const removePhoto = (index: number) => {
    setPhotos((prev) => {
      const toRemove = prev[index];
      if (toRemove?.previewUrl) URL.revokeObjectURL(toRemove.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  };

  const descriptionValid = description.trim().length >= MIN_DESCRIPTION_LENGTH;
  const canSubmit =
    !!selectedReason && descriptionValid && !submitting && photos.every((p) => !p.uploading);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !selectedReason) return;

    setSubmitting(true);
    setError(null);
    try {
      await apiPost('/disputes', {
        orderId,
        reason: selectedReason,
        description: description.trim(),
        evidenceUrls: photos.map((p) => p.uploadedUrl).filter((u): u is string => !!u),
      });
      setSuccess(true);
      setTimeout(() => router.push(`/orders/${orderId}`), 1500);
    } catch {
      setError('Não foi possível abrir a disputa. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="animate-pulse h-72 bg-gray-100 rounded-xl" />
      </div>
    );
  }

  const orderTitle = order?.listing?.title ?? order?.item?.title ?? 'Pedido';
  const orderTotal = order?.totalBrl ?? order?.total ?? 0;

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Abrir disputa</h1>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700" role="alert">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
          Disputa registrada. Nossa equipe entrará em contato em breve.
        </div>
      )}

      {order && (
        <section className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Resumo do pedido</h2>
          <div className="flex items-start justify-between text-xs text-gray-600">
            <div>
              <p><span className="text-gray-400">Pedido:</span> #{order.id.slice(0, 8)}</p>
              <p><span className="text-gray-400">Item:</span> {orderTitle}</p>
              {order.seller?.name && (
                <p><span className="text-gray-400">Vendedor:</span> {order.seller.name}</p>
              )}
            </div>
            <p className="text-sm font-bold text-brand-600">{formatBRL(orderTotal)}</p>
          </div>
        </section>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <section className="bg-white border border-gray-200 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Motivo da disputa</h2>
          <div className="space-y-2">
            {REASONS.map((r) => (
              <label
                key={r}
                className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition ${
                  selectedReason === r
                    ? 'border-brand-500 bg-brand-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <input
                  type="radio"
                  name="reason"
                  value={r}
                  checked={selectedReason === r}
                  onChange={() => setSelectedReason(r)}
                  className="text-brand-600 focus:ring-brand-500"
                />
                <span className={`text-sm ${selectedReason === r ? 'text-brand-700 font-medium' : 'text-gray-700'}`}>
                  {DISPUTE_REASON_PT[r]}
                </span>
              </label>
            ))}
          </div>
        </section>

        <section className="bg-white border border-gray-200 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Descreva o problema</h2>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value.slice(0, MAX_DESCRIPTION_LENGTH))}
            rows={6}
            placeholder="Descreva com detalhes o que aconteceu (mínimo 20 caracteres)…"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-y"
          />
          <div className="flex items-center justify-between mt-2">
            <p className={`text-xs ${description.length > 0 && !descriptionValid ? 'text-amber-600' : 'text-gray-400'}`}>
              {description.trim().length}/{MAX_DESCRIPTION_LENGTH} caracteres
              {description.length > 0 && !descriptionValid ? ` (mínimo ${MIN_DESCRIPTION_LENGTH})` : ''}
            </p>
          </div>
        </section>

        <section className="bg-white border border-gray-200 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-gray-900 mb-1">Fotos de evidência (opcional)</h2>
          <p className="text-xs text-gray-500 mb-3">
            Adicione até {MAX_EVIDENCE_PHOTOS} fotos que mostrem o problema com o item recebido.
          </p>
          <div className="flex flex-wrap gap-3">
            {photos.map((p, idx) => (
              <div key={p.previewUrl} className="relative w-20 h-20">
                <Image
                  src={p.previewUrl}
                  alt={`Evidência ${idx + 1}`}
                  fill
                  unoptimized
                  className="object-cover rounded-lg border border-gray-200"
                  sizes="80px"
                />
                {p.uploading && (
                  <div className="absolute inset-0 bg-white/70 rounded-lg flex items-center justify-center">
                    <span className="text-xs text-gray-500">…</span>
                  </div>
                )}
                {p.error && (
                  <div className="absolute inset-0 bg-red-50/80 rounded-lg flex items-center justify-center">
                    <span className="text-[10px] text-red-600">{p.error}</span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => removePhoto(idx)}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-white border border-gray-200 rounded-full text-xs text-gray-600 hover:text-red-600 shadow-sm"
                  aria-label="Remover foto"
                >
                  ×
                </button>
              </div>
            ))}
            {photos.length < MAX_EVIDENCE_PHOTOS && (
              <label className="w-20 h-20 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center text-xs text-gray-500 cursor-pointer hover:border-brand-400 hover:text-brand-600 transition">
                + Foto
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  hidden
                  onChange={(e) => addPhotos(e.target.files)}
                />
              </label>
            )}
          </div>
        </section>

        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full py-3 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 transition disabled:opacity-50"
        >
          {submitting ? 'Enviando…' : 'Abrir disputa'}
        </button>
      </form>
    </div>
  );
}
