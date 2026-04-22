import { apiFetch } from './api';
import { uploadListingImage } from './listings';

export interface Review {
  id: string;
  orderId: string;
  reviewerId: string;
  reviewerName: string;
  reviewerAvatarUrl?: string;
  reviewedId: string;
  rating: number;
  comment?: string;
  sellerReply?: string;
  sellerReplyAt?: string;
  imageUrls?: string[];
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
  imageUrls?: string[],
): Promise<Review> {
  return apiFetch<Review>('/reviews', {
    method: 'POST',
    body: JSON.stringify({ orderId, rating, comment, imageUrls }),
  });
}

export async function getReviews(userId: string, page?: number): Promise<ReviewsResponse> {
  const query = page ? `?page=${page}` : '';
  return apiFetch<ReviewsResponse>(
    `/reviews/${encodeURIComponent(userId)}${query}`,
    { authenticated: false },
  );
}

/**
 * Upload a review photo. Reuses the listing-image endpoint — same S3
 * validation, encryption, and moderation pipeline as any other user image.
 */
export async function uploadReviewImage(uri: string): Promise<string> {
  const res = await uploadListingImage(uri);
  return res.url;
}
