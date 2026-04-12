import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { apiFetch } from './api';

/**
 * Request push notification permissions, obtain the Expo push token,
 * and register it with the Vintage.br backend.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    return null;
  }

  // Get the native push token (FCM for Android, APNs for iOS)
  const tokenData = await Notifications.getDevicePushTokenAsync();
  const token = tokenData.data;
  const platform: 'ios' | 'android' = Platform.OS === 'ios' ? 'ios' : 'android';

  // Register with backend
  await apiFetch('/push/register', {
    method: 'POST',
    body: JSON.stringify({ token, platform }),
    headers: { 'Content-Type': 'application/json' },
    authenticated: true,
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
