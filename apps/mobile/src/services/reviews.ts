import { apiFetch } from './api';
import { uploadListingImage } from './listings';

// The backend currently validates rating ∈ {1, 5} (thumbs-down / thumbs-up;
// see apps/api/src/reviews/reviews.service.ts:19), but the mobile
// write-review screen uses a 1–5 star picker. That contradiction is a
// product-level decision, not a type problem — narrowing to `1 | 5` here
// would just move the error from runtime to compile time in the star
// picker. The type stays loose until the product direction is settled.
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
