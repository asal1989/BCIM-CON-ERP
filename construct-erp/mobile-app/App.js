import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { View, ActivityIndicator } from 'react-native';
import * as Notifications from 'expo-notifications';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { ChatProvider, useChat } from './src/context/ChatContext';
import { addChatNotificationListener } from './src/utils/pushNotifications';
import { CHANNELS } from './src/constants/chatChannels';
import LoginScreen from './src/screens/LoginScreen';
import ProjectSelectScreen from './src/screens/ProjectSelectScreen';
import RootNavigator from './src/navigation/RootNavigator';
import IncomingCallModal from './src/components/IncomingCallModal';
import { chatAPI } from './src/api/client';
import { theme } from './src/theme';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 1000 * 60 * 5, refetchOnReconnect: true },
  },
});

const navigationRef = createNavigationContainerRef();

// Handles the notification data payload, shared between tap-listener and cold-start.
function handleNotificationData(data, setIncomingCall) {
  if (!data?.type) return;
  if (!navigationRef.isReady()) return;

  if (data.type === 'mention') {
    const ch = CHANNELS.find(c => c.id === data.channel);
    navigationRef.navigate('ChatThread', { channel: data.channel, title: ch?.label || 'Chat', isGroup: true });
  } else if (data.type === 'dm') {
    navigationRef.navigate('ChatThread', { channel: data.channel, title: 'Chat', isGroup: false });
  } else if (data.type === 'incoming_call') {
    // App woke from a call FCM tap — fetch the stored offer from backend and show modal.
    chatAPI.pendingCall().then(r => {
      const pending = r.data?.pending;
      if (pending && setIncomingCall) setIncomingCall(pending);
    }).catch(() => {});
  }
}

// Rendered INSIDE ChatProvider so useChat() returns the real context.
function ChatNotificationHandler() {
  const { setIncomingCall } = useChat();

  useEffect(() => {
    // Listener for notification taps while the app is running (foreground or background).
    const sub = addChatNotificationListener(data => handleNotificationData(data, setIncomingCall));

    // Cold-start: app was killed, user tapped the notification → listener above
    // isn't registered yet when the tap fires, so check the last response on mount.
    Notifications.getLastNotificationResponseAsync().then(response => {
      if (!response) return;
      const data = response.notification.request.content.data;
      handleNotificationData(data, setIncomingCall);
    }).catch(() => {});

    return () => sub.remove();
  }, [setIncomingCall]);

  return null;
}

function AppContent() {
  const { booting, user, selectedProject } = useAuth();

  if (booting) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.dark }}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  if (!user) return <LoginScreen />;
  if (!selectedProject) return <ProjectSelectScreen />;
  return (
    <ChatProvider>
      {/* Handler is inside ChatProvider so useChat() has access to setIncomingCall */}
      <ChatNotificationHandler />
      <RootNavigator />
      <IncomingCallModal />
    </ChatProvider>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <NavigationContainer ref={navigationRef}>
              <StatusBar style="light" />
              <AppContent />
            </NavigationContainer>
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
