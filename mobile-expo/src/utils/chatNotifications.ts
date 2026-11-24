import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const CHAT_NOTIF_ENABLED_KEY = 'mgk_rn_chat_notifications_v1';
const CHAT_ANDROID_CHANNEL_ID = 'room-chat';

export type MobileNotificationPermissionState = 'granted' | 'denied' | 'undetermined';

let handlerConfigured = false;

export function configureMobileNotificationHandler(): void {
  if (handlerConfigured) return;
  handlerConfigured = true;
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  } catch {
    // ignore in restricted environments
  }
}

export async function ensureAndroidChatChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync(CHAT_ANDROID_CHANNEL_ID, {
      name: 'Room Chat',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 180, 100, 180],
      sound: 'default',
    });
  } catch {
    // ignore channel setup failures
  }
}

export async function loadChatNotificationsEnabled(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(CHAT_NOTIF_ENABLED_KEY);
    return raw === null ? true : raw === 'true';
  } catch {
    return true;
  }
}

export async function saveChatNotificationsEnabled(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(CHAT_NOTIF_ENABLED_KEY, String(enabled));
  } catch {
    // ignore
  }
}

export async function getMobileNotificationPermissionState(): Promise<MobileNotificationPermissionState> {
  try {
    const settings = await Notifications.getPermissionsAsync();
    if (settings.granted) return 'granted';
    if (!settings.canAskAgain) return 'denied';
    return 'undetermined';
  } catch {
    return 'undetermined';
  }
}

export async function requestMobileChatNotificationPermission(): Promise<MobileNotificationPermissionState> {
  try {
    await ensureAndroidChatChannel();
    const existing = await Notifications.getPermissionsAsync();
    if (existing.granted) return 'granted';
    const next = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: false,
        allowSound: true,
      },
    });
    if (next.granted) return 'granted';
    return next.canAskAgain ? 'undetermined' : 'denied';
  } catch {
    return 'denied';
  }
}

export async function scheduleIncomingChatNotification(params: {
  roomCode: string;
  title: string;
  body: string;
}): Promise<void> {
  try {
    const perms = await Notifications.getPermissionsAsync();
    if (!perms.granted) return;
    await ensureAndroidChatChannel();
    await Notifications.scheduleNotificationAsync({
      content: {
        title: params.title,
        body: params.body,
        sound: 'default',
        data: { roomCode: params.roomCode, openChat: true },
      },
      trigger: null,
    });
  } catch {
    // ignore runtime notification restriction (e.g. Expo Go without permission)
  }
}
