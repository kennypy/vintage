import { apiFetch } from './api';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  bio?: string;
  phone?: string;
  // null for OAuth accounts that haven't linked a CPF yet. Owner-only field
  // from /users/me — never exposed on public /users/:id.
  cpf?: string | null;
  cpfVerified?: boolean;
  // 'google' | 'apple' for OAuth accounts, null for email+password signups.
  socialProvider?: string | null;
  verified: boolean;
  ratingAvg: number;
  ratingCount: number;
  followerCount: number;
  followingCount: number;
  listingCount: number;
  walletBalance: number;
  createdAt: string;
}

export interface PublicProfile {
  id: string;
  name: string;
  avatarUrl?: string;
  verified: boolean;
  ratingAvg: number;
  ratingCount: number;
  followerCount: number;
  followingCount: number;
  listingCount: number;
  isFollowing: boolean;
  createdAt: string;
}

export async function getProfile(): Promise<UserProfile> {
  return apiFetch<UserProfile>('/users/me');
}

export async function getPublicProfile(id: string): Promise<PublicProfile> {
  return apiFetch<PublicProfile>(`/users/${encodeURIComponent(id)}`, {
    authenticated: false,
  });
}

export async function followUser(id: string): Promise<{ following: boolean }> {
  return apiFetch<{ following: boolean }>(
    `/users/${encodeURIComponent(id)}/follow`,
    { method: 'POST' },
  );
}

export async function unfollowUser(id: string): Promise<{ following: boolean }> {
  return apiFetch<{ following: boolean }>(
    `/users/${encodeURIComponent(id)}/follow`,
    { method: 'DELETE' },
  );
}

export interface UpdateProfileData {
  name?: string;
  bio?: string;
  phone?: string;
  avatarUrl?: string;
}

export async function updateProfile(
  id: string,
  data: UpdateProfileData,
): Promise<UserProfile> {
  return apiFetch<UserProfile>(`/users/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export interface UserListingsResponse {
  items: Array<{
    id: string;
    title: string;
    priceBrl: number;
    status: string;
    images: Array<{ url: string; position: number }>;
    condition: string;
    size: string;
    createdAt: string;
    favoriteCount: number;
    viewCount: number;
  }>;
  total: number;
  page: number;
  totalPages: number;
}

export async function getUserListings(
  id: string,
  page?: number,
): Promise<UserListingsResponse> {
  const query = page ? `&page=${page}` : '';
  return apiFetch<UserListingsResponse>(
    `/listings?sellerId=${encodeURIComponent(id)}${query}`,
    { authenticated: false },
  );
}

/**
 * One-shot CPF linker for OAuth accounts. The server rejects repeat calls
 * once a CPF is on file, so the UI should hide/disable the entry after
 * success. Pass the formatted or digits-only CPF — the server canonicalises.
 */
export async function setCpf(cpf: string): Promise<{ success: true }> {
  return apiFetch<{ success: true }>('/users/me/cpf', {
    method: 'POST',
    body: JSON.stringify({ cpf }),
  });
}
