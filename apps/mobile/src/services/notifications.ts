import { apiFetch } from './api';
import Constants from 'expo-constants';
import * as Device from 'expo-device';

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
  // NotificationsController registers this route as @Post('read-all')
  // (apps/api/src/notifications/notifications.controller.ts) to stay
  // verb-consistent with the web client's apiPost call. Using PATCH
  // here previously returned 405 Method Not Allowed on every mobile
  // "Marcar todas como lidas" tap.
  await apiFetch<void>('/notifications/read-all', {
    method: 'POST',
  });
}

/**
 * Register FCM device token for push notifications.
 * Called on app startup and token refresh.
 */
export async function registerDeviceToken(token: string): Promise<void> {
  const deviceId = `${Device.brand}-${Device.deviceName ?? 'unknown'}-${Constants.sessionId?.slice(0, 8) ?? 'unknown'}`;
  try {
    await apiFetch<void>('/notifications/device-token/register', {
      method: 'POST',
      body: JSON.stringify({ token, deviceId }),
    });
  } catch (error) {
    // Non-critical — log but don't crash if token registration fails
    console.warn('Failed to register FCM device token:', error);
  }
}

/**
 * Get device ID for this phone. Used for identifying and managing device tokens.
 */
export function getDeviceId(): string {
  return `${Device.brand}-${Device.deviceName ?? 'unknown'}-${Constants.sessionId?.slice(0, 8) ?? 'unknown'}`;
}
