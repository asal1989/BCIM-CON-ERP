import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import * as TaskManager from 'expo-task-manager';
import { notificationsAPI } from '../api/client';

// ── Foreground notification handler ──────────────────────────────────────
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const type = notification.request.content.data?.type;
    // Always show call notifications even in foreground as a banner
    return {
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: type !== 'incoming_call',
    };
  },
});

// ── Background notification task ─────────────────────────────────────────
// This task fires when an FCM notification arrives while the app is
// backgrounded OR killed. It runs in a headless JS context — no React UI
// available, but we can schedule a local follow-up notification.
const CALL_BG_TASK = 'INCOMING-CALL-BG-TASK';

TaskManager.defineTask(CALL_BG_TASK, ({ data, error }) => {
  if (error) { console.warn('[call-bg]', error); return; }
  const notifData = data?.notification?.request?.content?.data;
  if (notifData?.type !== 'incoming_call') return;

  // Schedule an immediate local notification so Android shows a heads-up
  // even if the system already dismissed the FCM one.
  Notifications.scheduleNotificationAsync({
    content: {
      title: `📞 Incoming Call`,
      body:  `${notifData.caller_name || 'Someone'} is calling you — tap to answer`,
      data:  notifData,
      sound: 'default',
      priority: Notifications.AndroidNotificationPriority.MAX,
    },
    trigger: null, // show immediately
  }).catch(() => {});
});

// ── Channel setup & device token registration ─────────────────────────────
export async function registerForPushNotifications() {
  try {
    if (!Device.isDevice) return;

    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    if (status !== 'granted') {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    if (status !== 'granted') return;

    if (Platform.OS === 'android') {
      // Regular alerts channel
      await Notifications.setNotificationChannelAsync('erp-alerts', {
        name: 'ERP Alerts',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#2563EB',
      });

      // Calls channel — MAX importance, bypasses DND, shows on lock screen.
      // Combined with USE_FULL_SCREEN_INTENT permission this triggers a
      // full-screen popup on Android instead of just a banner.
      await Notifications.setNotificationChannelAsync('erp-calls', {
        name: 'Incoming Calls',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 400, 200, 400, 200, 400],
        lightColor: '#22C55E',
        sound: 'default',
        bypassDnd: true,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        enableLights: true,
        enableVibrate: true,
        showBadge: false,
      });
    }

    // Register background task for call notifications
    const alreadyRegistered = await TaskManager.isTaskRegisteredAsync(CALL_BG_TASK).catch(() => false);
    if (!alreadyRegistered) {
      await Notifications.registerTaskAsync(CALL_BG_TASK).catch(() => {});
    }

    const { data: token } = await Notifications.getDevicePushTokenAsync();
    await notificationsAPI.registerDevice(token, Platform.OS);
  } catch (err) {
    console.warn('[push] registration failed:', err.message);
  }
}

// ── Listeners ─────────────────────────────────────────────────────────────
export function addNotificationResponseListener(onNavigate) {
  return Notifications.addNotificationResponseReceivedListener((response) => {
    const link = response.notification.request.content.data?.link;
    if (link) onNavigate(link);
  });
}

// Forwards ALL notification tap types (dm, mention, incoming_call) to handler
export function addChatNotificationListener(onOpenChat) {
  return Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data;
    if (data?.type) onOpenChat(data);
  });
}
