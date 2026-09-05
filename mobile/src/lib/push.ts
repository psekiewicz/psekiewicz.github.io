import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { registerPushToken, unregisterPushToken } from '../data/pushTokens';

// Foreground behaviour: without this, a push that arrives while the app is
// already open is delivered silently to the OS and never shown at all.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// A physical-device-only, EAS-project-only feature - a simulator has no
// push service to register with, and Expo's push relay needs to know
// which project a token belongs to, which only exists once `eas init`
// has run (see mobile/README.md). Both fail closed rather than throwing
// somewhere a caller wouldn't expect it.
function projectId(): string | null {
  return Constants.expoConfig?.extra?.eas?.projectId ?? null;
}

export function pushAvailable() {
  return Device.isDevice && Boolean(projectId());
}

export async function getPushPermissionStatus() {
  const { status } = await Notifications.getPermissionsAsync();
  return status;
}

// Requests permission if needed, then registers (or re-registers - the
// token can rotate) this device's Expo push token for `userId`. Safe to
// call on every login: registerPushToken() upserts on (user_id, token).
export async function enablePush(userId: string): Promise<string> {
  if (!Device.isDevice) {
    throw new Error('Push notifications need a physical device.');
  }
  const id = projectId();
  if (!id) {
    throw new Error(
      "This build has no EAS project id yet - run `eas init` once (see mobile/README.md's Push notifications section)."
    );
  }

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }
  if (status !== 'granted') {
    throw new Error('Notification permission was not granted.');
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.DEFAULT,
      lightColor: '#c03a17',
    });
  }

  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: id });
  await registerPushToken(userId, token);
  return token;
}

// Called silently (no permission prompt) whenever a session resumes, so a
// token that rotated since last launch stays in sync without asking again.
// Never throws - a background sync failing is not worth surfacing.
export async function syncPushTokenIfAlreadyEnabled(userId: string) {
  try {
    if (!pushAvailable()) return;
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return;
    await enablePush(userId);
  } catch {
    // Fine to stay silent - Settings' own toggle surfaces real errors.
  }
}

export async function disablePush(userId: string) {
  const id = projectId();
  if (!id) return;
  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: id });
    await unregisterPushToken(userId, token);
  } catch {
    // If the token can't be resolved there's nothing to remove server-side.
  }
}
