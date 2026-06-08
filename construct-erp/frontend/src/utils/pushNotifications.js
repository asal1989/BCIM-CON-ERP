// frontend/src/utils/pushNotifications.js
// Registers this Android device for FCM push notifications.
// Called once after the user logs in, from Layout.jsx.
import { Capacitor } from '@capacitor/core';

let _registered = false;

export async function initPushNotifications(apiClient) {
  // Only run on real Android/iOS device — skip in browser
  if (!Capacitor.isNativePlatform()) return;
  if (_registered) return;

  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');

    // 1. Request permission
    const permResult = await PushNotifications.requestPermissions();
    if (permResult.receive !== 'granted') {
      console.warn('[Push] Permission not granted:', permResult.receive);
      return;
    }

    // 2. Register with FCM
    await PushNotifications.register();

    // 3. Save FCM token to backend when received
    await PushNotifications.addListener('registration', async (token) => {
      console.log('[Push] FCM token received');
      try {
        await apiClient.post('/notifications/devices', {
          token: token.value,
          platform: 'android',
          enabled: true,
        });
        _registered = true;
        console.log('[Push] Device token registered with backend ✓');
      } catch (err) {
        console.error('[Push] Token registration failed:', err.message);
      }
    });

    // 4. Handle registration errors
    await PushNotifications.addListener('registrationError', (err) => {
      console.error('[Push] Registration error:', err);
    });

    // 5. Foreground notification — show as toast (notification arrives while app is open)
    await PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('[Push] Foreground notification:', notification.title);
      // The in-app notification bell already shows live data — no extra action needed
    });

    // 6. Tap on notification — navigate to the linked page
    await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      const link = action.notification.data?.link;
      if (link) {
        // Use hash navigation to avoid full page reload inside WebView
        window.location.hash = link.startsWith('/') ? `#${link}` : link;
      }
    });
  } catch (err) {
    console.error('[Push] initPushNotifications error:', err.message);
  }
}

/** Call this on logout to stop receiving notifications for this user */
export function resetPushRegistration() {
  _registered = false;
}
