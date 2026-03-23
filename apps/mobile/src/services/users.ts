import { apiFetch } from './api';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
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
    `/users/${encodeURIComponent(id)}/unfollow`,
    { method: 'POST' },
  );
}
