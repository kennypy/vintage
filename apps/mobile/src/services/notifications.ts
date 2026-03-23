import { apiFetch } from './api';

export interface AppNotification {
  id: string;
  type: 'order' | 'offer' | 'message' | 'follow' | 'review' | 'system';
  title: string;
  body: string;
  read: boolean;
  data?: Record<string, string>;
  createdAt: string;
}

export interface NotificationsResponse {
  items: AppNotification[];
  total: number;
  page: number;
  totalPages: number;
  unreadCount: number;
}

export async function getNotifications(page?: number): Promise<NotificationsResponse> {
  const query = page ? `?page=${page}` : '';
  return apiFetch<NotificationsResponse>(`/notifications${query}`);
}

export async function markRead(id: string): Promise<void> {
  await apiFetch<void>(`/notifications/${encodeURIComponent(id)}/read`, {
    method: 'PATCH',
  });
}

export async function markAllRead(): Promise<void> {
  await apiFetch<void>('/notifications/read-all', {
    method: 'PATCH',
  });
}
