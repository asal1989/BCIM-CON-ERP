import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { notificationsAPI } from '../api/client';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// Registers this device for push notifications and hands the token to the
// backend (POST /notifications/devices, table: notification_device_tokens).
// Call after a successful login. Safe to call repeatedly — the backend
// upserts on (user_id, token).
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
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#2563EB',
      });
    }

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const { data } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);

    await notificationsAPI.registerDevice(data, Platform.OS);
  } catch (err) {
    // Push registration must never block login/app usage.
    console.warn('[push] registration failed:', err.message);
  }
}

// Call when a notification is tapped (foreground or from a killed/background
// state) to deep-link to the relevant screen. `onNavigate` receives the
// `data.link` string that the backend attached to the notification.
export function addNotificationResponseListener(onNavigate) {
  return Notifications.addNotificationResponseReceivedListener((response) => {
    const link = response.notification.request.content.data?.link;
    if (link) onNavigate(link);
  });
}
