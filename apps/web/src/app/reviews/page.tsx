'use client';

import { Suspense, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { apiGet } from '@/lib/api';

interface Review {
  id: string;
  orderId: string;
  reviewerId: string;
  reviewerName: string;
  reviewerAvatarUrl?: string;
  rating: number;
  comment?: string;
  sellerReply?: string;
  sellerReplyAt?: string;
  createdAt: string;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <svg
          key={star}
          className={`w-4 h-4 ${star <= rating ? 'text-yellow-400' : 'text-gray-200'}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  );
}

export default function ReviewsPageWrapper() {
  return (
    <Suspense fallback={<div className="max-w-3xl mx-auto px-4 py-8"><div className="animate-pulse h-8 bg-gray-200 rounded w-48" /></div>}>
      <ReviewsPage />
    </Suspense>
  );
}

function ReviewsPage() {
  const searchParams = useSearchParams();
  const userId = searchParams.get('userId') ?? '';
  const userName = searchParams.get('name') ?? 'Usuario';

  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [avgRating, setAvgRating] = useState(0);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    apiGet<{ items: Review[] } | Review[]>(`/reviews/${encodeURIComponent(userId)}`)
      .then((res) => {
        const list = Array.isArray(res) ? res : (res.items ?? []);
        setReviews(list);
        if (list.length > 0) {
          setAvgRating(list.reduce((sum, r) => sum + r.rating, 0) / list.length);
        }
      })
      .catch(() => setReviews([]))
      .finally(() => setLoading(false));
  }, [userId]);

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Avaliacoes de {userName}</h1>

      {reviews.length > 0 && (
        <div className="flex items-center gap-3 mb-6">
          <StarRating rating={Math.round(avgRating)} />
          <span className="text-sm text-gray-600">{avgRating.toFixed(1)} ({reviews.length} avaliacoes)</span>
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="animate-pulse bg-white border border-gray-200 rounded-xl p-4 space-y-2">
              <div className="flex gap-3">
                <div className="w-10 h-10 bg-gray-200 rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-1/3" />
                  <div className="h-3 bg-gray-200 rounded w-2/3" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : reviews.length === 0 ? (
        <div className="text-center py-16">
          <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
          </svg>
          <p className="text-gray-500">Nenhuma avaliacao por enquanto.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {reviews.map((review) => (
            <div key={review.id} className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-brand-100 rounded-full flex items-center justify-center text-brand-600 font-semibold text-sm flex-shrink-0 overflow-hidden">
                  {review.reviewerAvatarUrl ? (
                    <Image src={review.reviewerAvatarUrl} alt={review.reviewerName} width={40} height={40} className="rounded-full object-cover" />
                  ) : (
                    review.reviewerName.charAt(0).toUpperCase()
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-gray-900">{review.reviewerName}</p>
                    <span className="text-xs text-gray-400">{formatDate(review.createdAt)}</span>
                  </div>
                  <StarRating rating={review.rating} />
                  {review.comment && (
                    <p className="text-sm text-gray-600 mt-2">{review.comment}</p>
                  )}
                  {review.sellerReply && (
                    <div className="mt-3 pl-3 border-l-2 border-gray-200">
                      <p className="text-xs text-gray-500 mb-1">Resposta do vendedor:</p>
                      <p className="text-sm text-gray-600">{review.sellerReply}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
