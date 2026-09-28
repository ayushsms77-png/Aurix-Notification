import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Aurix push notifications (Expo Push + FCM).
 *
 * Deliberately self-contained: it touches nothing in playback, navigation or
 * the library. A notification tap just opens the app (Android's default) --
 * no routing. Call initNotifications() once, after the first screen is up.
 */

const CHANNEL_ID = 'daily';
const STORE_KEY = 'aurix:push:v1';
/** Re-send the token to the server at most this often when it hasn't changed. */
const REFRESH_MS = 24 * 60 * 60 * 1000;

type Stored = { token: string; at: number };

const functionsUrl = (): string | undefined =>
  (Constants.expoConfig?.extra as { supabaseFunctionsUrl?: string } | undefined)?.supabaseFunctionsUrl;

let started = false;

// Show notifications even while the app is open (quietly: no sound).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Aurix Daily',
    description: 'Daily nudges and song picks from Aurix',
    importance: Notifications.AndroidImportance.DEFAULT,
    lightColor: '#FA2D55',
    vibrationPattern: [0, 200, 100, 200],
  });
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * The player already asks for the Android 13+ notification permission at
 * startup. To avoid two system dialogs racing, wait briefly and re-check
 * before asking ourselves. If the user denied, we stop -- no nagging.
 */
async function hasPermission(): Promise<boolean> {
  let perm = await Notifications.getPermissionsAsync();
  if (perm.granted) return true;
  if (perm.canAskAgain === false) return false;
  await sleep(4000);
  perm = await Notifications.getPermissionsAsync();
  if (perm.granted) return true;
  if (perm.canAskAgain === false) return false;
  perm = await Notifications.requestPermissionsAsync();
  return perm.granted;
}

async function getToken(): Promise<string | null> {
  const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
  const res = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
  return res.data ?? null;
}

async function sendToServer(token: string): Promise<boolean> {
  const base = functionsUrl();
  if (!base) return false;
  const res = await fetch(`${base}/register-device`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      expo_push_token: token,
      platform: Platform.OS,
      app_version: Constants.expoConfig?.version ?? null,
    }),
  });
  return res.ok;
}

/** Register (or refresh) this device's token. Safe to call repeatedly. */
async function register(force = false): Promise<void> {
  try {
    const token = await getToken();
    if (!token) return;
    const raw = await AsyncStorage.getItem(STORE_KEY);
    const prev: Stored | null = raw ? JSON.parse(raw) : null;
    const fresh = prev && prev.token === token && Date.now() - prev.at < REFRESH_MS;
    if (fresh && !force) return;
    if (await sendToServer(token)) {
      await AsyncStorage.setItem(STORE_KEY, JSON.stringify({ token, at: Date.now() } as Stored));
    }
  } catch (e) {
    // Offline, emulator, missing FCM config...: never let this affect the app.
    if (__DEV__) console.log('[Notifications] register failed:', e);
  }
}

export async function initNotifications(): Promise<void> {
  if (started || Platform.OS === 'web') return;
  started = true;
  try {
    await ensureChannel();

    // Token rotated by FCM/Expo -> register the new one.
    Notifications.addPushTokenListener(() => {
      void register(true);
    });

    // Tapping a notification opens the app (default). Listener only keeps the
    // event handled; it deliberately does not navigate anywhere.
    Notifications.addNotificationResponseReceivedListener(() => undefined);

    if (await hasPermission()) await register();
  } catch (e) {
    if (__DEV__) console.log('[Notifications] init failed:', e);
  }
}
