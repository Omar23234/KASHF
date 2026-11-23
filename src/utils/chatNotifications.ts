const CHAT_NOTIF_ENABLED_KEY = 'mgk_chat_notifications_v1';

export type WebNotificationPermissionState = NotificationPermission | 'unsupported';

export function loadChatNotificationsEnabled(): boolean {
  try {
    const raw = localStorage.getItem(CHAT_NOTIF_ENABLED_KEY);
    return raw === null ? true : raw === 'true';
  } catch {
    return true;
  }
}

export function saveChatNotificationsEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(CHAT_NOTIF_ENABLED_KEY, String(enabled));
  } catch {
    // ignore storage errors
  }
}

export function getWebNotificationPermissionState(): WebNotificationPermissionState {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

export async function requestChatNotificationPermission(): Promise<WebNotificationPermissionState> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  if (Notification.permission === 'granted' || Notification.permission === 'denied') {
    return Notification.permission;
  }
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export async function showIncomingChatNotification(params: {
  roomCode: string;
  title: string;
  body: string;
  onOpenChat: () => void;
}): Promise<void> {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  const iconUrl = '/pwa-192x192.png';
  const tag = `mgk-chat-${params.roomCode}`;

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg && typeof reg.showNotification === 'function') {
        await reg.showNotification(params.title, {
          body: params.body,
          icon: iconUrl,
          badge: iconUrl,
          tag,
          data: { roomCode: params.roomCode },
        });
        return;
      }
    }
  } catch {
    // Fall back to direct Window Notification
  }

  try {
    const notif = new Notification(params.title, {
      body: params.body,
      icon: iconUrl,
      tag,
    });
    notif.onclick = () => {
      try {
        window.focus();
      } catch {
        // ignore focus restriction
      }
      notif.close();
      params.onOpenChat();
    };
  } catch {
    // Some mobile webviews disallow `new Notification` directly
  }
}
