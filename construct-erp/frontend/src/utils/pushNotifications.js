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
      try {
        await apiClient.post('/notifications/devices', {
          token: token.value,
          platform: 'android',
          enabled: true,
        });
        _registered = true;
      } catch (err) {
        console.error('[Push] Token registration failed:', err.message);
      }
    });

    // 4. Handle registration errors
    await PushNotifications.addListener('registrationError', (err) => {
      console.error('[Push] Registration error:', err);
    });

    // 5. Create the Android notification channel (required for Android 8+).
    // Without this channel, FCM messages are silently dropped on modern Android.
    await PushNotifications.createChannel({
      id:          'erp-alerts',
      name:        'ERP Alerts',
      description: 'BCIM ERP workflow notifications',
      importance:  5,   // IMPORTANCE_HIGH — shows heads-up banner + sound
      visibility:  1,   // VISIBILITY_PUBLIC
      sound:       'default',
      lights:      true,
      vibration:   true,
    }).catch(() => {}); // no-op on iOS / older Android

    // 6. Foreground notification — bell already shows live data, no extra action needed
    await PushNotifications.addListener('pushNotificationReceived', (_notification) => {
      // intentional no-op: in-app bell updates via socket
    });

    // 7. Tap on notification — navigate to the linked page
    await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      const link = action.notification.data?.link;
      if (link) {
        // HTML5 history navigation — correct for Capacitor WebView (not hash routing)
        window.location.href = link.startsWith('/') ? link : `/${link}`;
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
