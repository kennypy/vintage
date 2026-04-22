'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { apiPost, apiPostForm } from '@/lib/api';

const MAX_PHOTOS = 4;

interface ReviewPhoto {
  id: string;
  previewUrl: string;
  uploadedUrl?: string;
  uploading: boolean;
  error?: boolean;
}

const RATING_HINTS: Record<number, string> = {
  1: 'Muito ruim',
  2: 'Ruim',
  3: 'Regular',
  4: 'Bom',
  5: 'Excelente',
};

export default function WriteReviewPageWrapper() {
  return (
    <Suspense fallback={<div className="max-w-lg mx-auto px-4 py-8"><div className="animate-pulse h-8 bg-gray-200 rounded w-48" /></div>}>
      <WriteReviewPage />
    </Suspense>
  );
}

function WriteReviewPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderId = searchParams.get('orderId') ?? '';

  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [comment, setComment] = useState('');
  const [photos, setPhotos] = useState<ReviewPhoto[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const remaining = MAX_PHOTOS - photos.length;
    const files = Array.from(fileList).slice(0, remaining);

    for (const file of files) {
      const id = `${file.name}-${file.size}-${Date.now()}`;
      const previewUrl = URL.createObjectURL(file);
      setPhotos((prev) => [...prev, { id, previewUrl, uploading: true }]);

      const form = new FormData();
      form.append('file', file);
      try {
        const res = await apiPostForm<{ url: string }>('/uploads/listing-image', form);
        setPhotos((prev) =>
          prev.map((p) => (p.id === id ? { ...p, uploadedUrl: res.url, uploading: false } : p)),
        );
      } catch {
        setPhotos((prev) =>
          prev.map((p) => (p.id === id ? { ...p, uploading: false, error: true } : p)),
        );
      }
    }
  };

  const removePhoto = (id: string) => {
    setPhotos((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  };

  const handleSubmit = async () => {
    if (!orderId) {
      setError('Pedido nao encontrado.');
      return;
    }
    if (rating === 0) {
      setError('Selecione uma avaliacao.');
      return;
    }
    if (photos.some((p) => p.uploading)) {
      setError('Aguarde o upload das fotos terminar.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const imageUrls = photos
        .map((p) => p.uploadedUrl)
        .filter((u): u is string => !!u);
      await apiPost('/reviews', {
        orderId,
        rating,
        comment: comment.trim() || undefined,
        imageUrls: imageUrls.length ? imageUrls : undefined,
      });
      router.push('/orders');
    } catch {
      setError('Erro ao enviar avaliacao. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  const displayRating = hoveredRating || rating;

  return (
    <div className="max-w-lg mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Avaliar compra</h1>

      <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-6">
        {/* Star picker */}
        <div>
          <label className="text-sm font-medium text-gray-900 block mb-3">Como foi sua experiencia?</label>
          <div className="flex gap-1 items-center">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => setRating(star)}
                onMouseEnter={() => setHoveredRating(star)}
                onMouseLeave={() => setHoveredRating(0)}
                className="p-1 transition-transform hover:scale-110"
              >
                <svg
                  className={`w-8 h-8 transition-colors ${
                    star <= displayRating ? 'text-yellow-400' : 'text-gray-200'
                  }`}
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              </button>
            ))}
            {displayRating > 0 && (
              <span className="ml-2 text-sm text-gray-500">{RATING_HINTS[displayRating]}</span>
            )}
          </div>
        </div>

        {/* Comment */}
        <div>
          <label className="text-sm font-medium text-gray-900 block mb-2">
            Comentario <span className="text-gray-400 font-normal">(opcional)</span>
          </label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value.slice(0, 500))}
            placeholder="Conte como foi sua experiencia com a compra..."
            rows={4}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 resize-none"
          />
          <p className="text-xs text-gray-400 text-right mt-1">{comment.length}/500</p>
        </div>

        {/* Photos */}
        <div>
          <label className="text-sm font-medium text-gray-900 block mb-2">
            Fotos <span className="text-gray-400 font-normal">(opcional, máx {MAX_PHOTOS})</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {photos.map((p) => (
              <div key={p.id} className="relative w-20 h-20 rounded-lg overflow-hidden bg-gray-100">
                <Image
                  src={p.previewUrl}
                  alt=""
                  fill
                  sizes="80px"
                  className="object-cover"
                  unoptimized
                />
                {p.uploading && (
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center text-white text-xs">
                    Enviando…
                  </div>
                )}
                {p.error && (
                  <div className="absolute inset-0 bg-red-500/60 flex items-center justify-center text-white text-xs">
                    Erro
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => removePhoto(p.id)}
                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white text-xs flex items-center justify-center"
                  aria-label="Remover foto"
                >
                  ×
                </button>
              </div>
            ))}
            {photos.length < MAX_PHOTOS && (
              <label className="w-20 h-20 rounded-lg border border-dashed border-gray-300 bg-gray-50 flex flex-col items-center justify-center text-xs text-gray-500 cursor-pointer hover:bg-gray-100">
                <span>+ Foto</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    handleFiles(e.target.files);
                    e.target.value = '';
                  }}
                />
              </label>
            )}
          </div>
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || rating === 0}
          className="w-full py-3 bg-brand-600 text-white rounded-xl font-medium hover:bg-brand-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? 'Enviando...' : 'Enviar avaliacao'}
        </button>
      </div>
    </div>
  );
}
