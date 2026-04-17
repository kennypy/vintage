import { apiFetch } from './api';

export type ReportTargetType = 'listing' | 'message' | 'user' | 'review';
export type ReportReason =
  | 'spam'
  | 'counterfeit'
  | 'inappropriate'
  | 'fraud'
  | 'harassment'
  | 'other';

export interface CreateReportInput {
  targetType: ReportTargetType;
  targetId: string;
  reason: ReportReason;
  description?: string;
}

export async function createReport(input: CreateReportInput): Promise<void> {
  await apiFetch<void>('/reports', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function blockUser(userId: string): Promise<void> {
  await apiFetch<void>(`/users/${encodeURIComponent(userId)}/block`, { method: 'POST' });
}

export async function unblockUser(userId: string): Promise<void> {
  await apiFetch<void>(`/users/${encodeURIComponent(userId)}/block`, { method: 'DELETE' });
}

export interface BlockSummary {
  userId: string;
  blockedAt: string;
  name: string;
  avatarUrl: string | null;
}

export async function listBlockedUsers(): Promise<{ items: BlockSummary[]; blockedIds: string[] }> {
  return apiFetch<{ items: BlockSummary[]; blockedIds: string[] }>('/users/me/blocks', {
    method: 'GET',
  });
}

// --- Account Deletion ---

export interface DeleteAccountInput {
  password?: string;
  confirmToken?: string;
  reason?: string;
}

export async function deleteAccount(input: DeleteAccountInput): Promise<void> {
  await apiFetch<void>('/users/me', {
    method: 'DELETE',
    body: JSON.stringify(input),
  });
}

export async function requestDeletionConfirmation(): Promise<void> {
  await apiFetch<void>('/users/me/delete-confirmation', { method: 'POST' });
}
