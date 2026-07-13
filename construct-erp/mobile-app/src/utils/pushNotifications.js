import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { notificationsAPI } from '../api/client';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// The backend sends push via the Firebase Admin SDK directly to raw FCM/APNs
// device tokens — it does NOT go through Expo's push relay. So this MUST
// request the native device token (getDevicePushTokenAsync), not an Expo
// push token. On Android this requires google-services.json and an EAS/dev
// build (this does not work inside Expo Go).
export async function registerForPushNotifications() {
  try {
    if (!Device.isDevice) return; // push tokens aren't available on simulators

    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    if (status !== 'granted') {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    if (status !== 'granted') return;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('erp-alerts', {
        name: 'ERP Alerts',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#2563EB',
      });
      // Separate high-importance channel for incoming calls so they ring
      // at max volume and show as heads-up even in DND (user must grant DND access).
      await Notifications.setNotificationChannelAsync('erp-calls', {
        name: 'Incoming Calls',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 400, 200, 400, 200, 400],
        lightColor: '#22C55E',
        sound: 'default',
        bypassDnd: true,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      });
    }

    const { data: token } = await Notifications.getDevicePushTokenAsync();
    await notificationsAPI.registerDevice(token, Platform.OS);
  } catch (err) {
    console.warn('[push] registration failed:', err.message);
  }
}

export function addNotificationResponseListener(onNavigate) {
  return Notifications.addNotificationResponseReceivedListener((response) => {
    const link = response.notification.request.content.data?.link;
    if (link) onNavigate(link);
  });
}

// Chat-specific push taps (DM / @mention) carry { type, channel } instead of
// a generic `link` — the backend's fcm.service.js sends these from the
// server.js socket handler when a DM or mention lands. Separate from
// addNotificationResponseListener above since it needs to know the CHANNELS
// list to build a sensible screen title, not just a raw route name.
export function addChatNotificationListener(onOpenChat) {
  return Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data;
    if (data?.type) onOpenChat(data);
  });
}
