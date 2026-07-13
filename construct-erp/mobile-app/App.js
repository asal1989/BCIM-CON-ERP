import React, { useEffect, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { View, ActivityIndicator } from 'react-native';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { ChatProvider } from './src/context/ChatContext';
import { addChatNotificationListener } from './src/utils/pushNotifications';
import { CHANNELS } from './src/constants/chatChannels';
import LoginScreen from './src/screens/LoginScreen';
import ProjectSelectScreen from './src/screens/ProjectSelectScreen';
import RootNavigator from './src/navigation/RootNavigator';
import IncomingCallModal from './src/components/IncomingCallModal';
import { theme } from './src/theme';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 1000 * 60 * 5, refetchOnReconnect: true },
  },
});

const navigationRef = createNavigationContainerRef();

// Tapping a DM or @mention push notification opens that conversation
// directly instead of just bringing the app to the foreground. For a channel
// mention we already know the label from CHANNELS; for a DM we only have the
// sender's id at tap time (no guarantee ChatContext's employee list has
// loaded yet on a cold start), so it opens with a generic title — the thread
// itself still loads correctly since it's keyed by channel id, not title.
function useChatNotificationNavigation() {
  useEffect(() => {
    const sub = addChatNotificationListener((data) => {
      if (!navigationRef.isReady()) return;
      if (data.type === 'mention') {
        const ch = CHANNELS.find(c => c.id === data.channel);
        navigationRef.navigate('ChatThread', { channel: data.channel, title: ch?.label || 'Chat', isGroup: true });
      } else if (data.type === 'dm') {
        navigationRef.navigate('ChatThread', { channel: data.channel, title: 'Chat', isGroup: false });
      }
    });
    return () => sub.remove();
  }, []);
}

function AppContent() {
  const { booting, user, selectedProject } = useAuth();
  useChatNotificationNavigation();

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
