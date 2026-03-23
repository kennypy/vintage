import { apiFetch } from './api';

export interface Review {
  id: string;
  orderId: string;
  reviewerId: string;
  reviewerName: string;
  reviewerAvatarUrl?: string;
  reviewedId: string;
  rating: number;
  comment?: string;
  createdAt: string;
}

export interface ReviewsResponse {
  items: Review[];
  total: number;
  page: number;
  totalPages: number;
}

export async function submitReview(
  orderId: string,
  rating: number,
  comment?: string,
): Promise<Review> {
  return apiFetch<Review>('/reviews', {
    method: 'POST',
    body: JSON.stringify({ orderId, rating, comment }),
  });
}

export async function getReviews(userId: string, page?: number): Promise<ReviewsResponse> {
  const query = page ? `?page=${page}` : '';
  return apiFetch<ReviewsResponse>(
    `/reviews/${encodeURIComponent(userId)}${query}`,
    { authenticated: false },
  );
}
