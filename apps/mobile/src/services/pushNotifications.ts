import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { apiFetch } from './api';
import { registerDeviceToken as registerFcmToken } from './notifications';
import { ensureNotificationPermission } from './permissions';

/**
 * Request push notification permissions (via the shared helper so a
 * denial routes through the Settings deep-link UX), obtain the native
 * push token, and register it with the Vintage.br backend.
 *
 * Call this ONLY after the user has seen the first-run primer
 * (AuthContext/AppShell). If the user hasn't granted permission it
 * returns null silently — the caller should not treat that as an error.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  const granted = await ensureNotificationPermission({
    purpose:
      'para te avisar de mensagens, ofertas e atualizações dos seus pedidos',
  });
  if (!granted) return null;

  // Get the native push token (FCM for Android, APNs for iOS). This
  // only works once Firebase (Android) / APNs (iOS) credentials are
  // configured in EAS. Before those land, getDevicePushTokenAsync
  // throws on-device — we swallow here so dev builds without creds
  // still boot.
  let token: string;
  try {
    const tokenData = await Notifications.getDevicePushTokenAsync();
    token = tokenData.data;
  } catch {
    return null;
  }
  const platform: 'ios' | 'android' = Platform.OS === 'ios' ? 'ios' : 'android';

  await apiFetch('/push/register', {
    method: 'POST',
    body: JSON.stringify({ token, platform }),
    headers: { 'Content-Type': 'application/json' },
    authenticated: true,
  });

  // Also register the device token with the FCM service for push notifications
  // (fire-and-forget — failures are logged but don't break the auth flow)
  registerFcmToken(token).catch(() => {
    if (__DEV__) console.warn('FCM device token registration failed');
  });

  return token;
}

/**
 * Unregister the current device's push token from the backend.
 */
export async function unregisterPushToken(token: string): Promise<void> {
  await apiFetch('/push/unregister', {
    method: 'DELETE',
    body: JSON.stringify({ token }),
    headers: { 'Content-Type': 'application/json' },
    authenticated: true,
  });
}

/**
 * Configure how notifications appear when the app is in the foreground.
 */
export function configureForegroundNotifications(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}
