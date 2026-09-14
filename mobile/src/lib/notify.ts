import AsyncStorage from '@react-native-async-storage/async-storage';
import * as BackgroundTask from 'expo-background-task';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { AppState, Platform } from 'react-native';

import { getProfilesByIds } from '../data/profiles';
import { getProjectTitles } from '../data/projects';
import { supabase } from './supabase';

// Phone notifications for likes, comments and follows - without Firebase.
//
// Real push on Android only travels through Firebase Cloud Messaging, which
// isn't available to this project. So instead of the server reaching the
// phone, the phone asks: a background task Android wakes roughly every 15
// minutes (its minimum, and only a minimum - idle and battery saver stretch
// it) reads the signed-in account's unread rows from `public.notifications`,
// the same table the site's bell uses, and shows any it hasn't shown before as
// local notifications. Late by design; nothing else is needed on the server.
//
// While the app is open the same check also runs on returning to it.

const TASK = 'showcase-notification-check';
const ENABLED_KEY = 'notify:enabled';
// Per account, so switching accounts neither re-announces the other one's
// backlog nor skips anything.
const lastSeenKey = (userId: string) => `notify:lastSeen:${userId}`;
const CHANNEL = 'activity';

const VERBS: Record<string, string> = {
  like: 'liked',
  comment: 'commented on',
  follow: 'started following you',
};

// Shown even when the app is in front: without a handler Android delivers a
// foreground notification silently.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Must be defined at module load, before React renders: Android can start the
// JavaScript runtime just to run this task, with no UI at all.
TaskManager.defineTask(TASK, async () => {
  try {
    await checkForNew();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

async function ensureChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL, {
    name: 'Likes, comments and follows',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

/** Shows anything unread that arrived since the last check. Never throws for "nothing to do". */
export async function checkForNew() {
  if ((await AsyncStorage.getItem(ENABLED_KEY)) !== '1') return;
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) return;

  const key = lastSeenKey(userId);
  const since = await AsyncStorage.getItem(key);
  if (!since) {
    // First check for this account: start from now rather than announcing
    // everything that was already sitting unread.
    await AsyncStorage.setItem(key, new Date().toISOString());
    return;
  }

  // RLS limits this to the signed-in user's own rows.
  const { data: rows, error } = await supabase
    .from('notifications')
    .select('id, actor_id, type, project_id, created_at')
    .is('read_at', null)
    .gt('created_at', since)
    .order('created_at', { ascending: true })
    .limit(20);
  if (error) throw new Error(error.message);
  if (!rows || rows.length === 0) return;

  const [actors, titles] = await Promise.all([
    getProfilesByIds(rows.map((r: any) => r.actor_id)).catch(() => new Map()),
    getProjectTitles(rows.map((r: any) => r.project_id).filter(Boolean)).catch(() => new Map()),
  ]);

  await ensureChannel();
  for (const row of rows as any[]) {
    const name = actors.get(row.actor_id)?.displayName || 'Someone';
    const title = row.project_id ? titles.get(row.project_id) : null;
    const verb = VERBS[row.type] || row.type;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Showcase',
        body: title ? `${name} ${verb} ${title}` : `${name} ${verb}`,
        // Opened through the app's own linking config (RootNavigator).
        data: {
          url: row.project_id
            ? `showcase://project.html?id=${row.project_id}`
            : `showcase://user?userId=${row.actor_id}`,
        },
      },
      trigger: Platform.OS === 'android' ? { channelId: CHANNEL } : null,
    });
  }
  await AsyncStorage.setItem(key, rows[rows.length - 1].created_at);
}

export async function notificationsEnabled() {
  const [flag, permission, registered] = await Promise.all([
    AsyncStorage.getItem(ENABLED_KEY),
    Notifications.getPermissionsAsync(),
    TaskManager.isTaskRegisteredAsync(TASK),
  ]);
  return flag === '1' && permission.status === 'granted' && registered;
}

export async function enableNotifications() {
  const status = await BackgroundTask.getStatusAsync();
  if (status !== BackgroundTask.BackgroundTaskStatus.Available) {
    throw new Error('Background activity is restricted for this app in Android settings.');
  }
  let { status: permission } = await Notifications.getPermissionsAsync();
  if (permission !== 'granted') {
    ({ status: permission } = await Notifications.requestPermissionsAsync());
  }
  if (permission !== 'granted') throw new Error('Notification permission was not granted.');

  await ensureChannel();
  await AsyncStorage.setItem(ENABLED_KEY, '1');
  await BackgroundTask.registerTaskAsync(TASK, { minimumInterval: 15 });
  await checkForNew();
}

export async function disableNotifications() {
  await AsyncStorage.removeItem(ENABLED_KEY);
  if (await TaskManager.isTaskRegisteredAsync(TASK)) {
    await BackgroundTask.unregisterTaskAsync(TASK);
  }
}

// Returning to the app is a free moment to check - no need to wait for Android.
AppState.addEventListener('change', (state) => {
  if (state === 'active') checkForNew().catch(() => {});
});
