import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { addNotificationResponseListener } from './src/utils/pushNotifications';
import { theme } from './src/theme';
import LoginScreen from './src/screens/LoginScreen';
import ProjectSelectScreen from './src/screens/ProjectSelectScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import MaterialRequestScreen from './src/screens/MaterialRequestScreen';
import StoresScreen from './src/screens/StoresScreen';
import BillsScreen from './src/screens/BillsScreen';
import AssetsScreen from './src/screens/AssetsScreen';
import DocumentsScreen from './src/screens/DocumentsScreen';
import ESSScreen from './src/screens/ESSScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import MoreScreen from './src/screens/MoreScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const MoreStack = createNativeStackNavigator();
const navigationRef = createNavigationContainerRef();

// Backend notification links are web paths (e.g. "/hr/leave"); the mobile
// app only has a handful of screens today, so this is a best-effort mapping
// rather than full deep linking — good enough to land on the right tab.
function navigateForLink(link) {
  if (!navigationRef.isReady() || !link) return;
  if (link.startsWith('/hr/leave')) navigationRef.navigate('Main', { screen: 'More', params: { screen: 'ESS' } });
  else if (link.startsWith('/stores/mrs') || link.startsWith('/procurement/mrs')) navigationRef.navigate('Main', { screen: 'MRS' });
  else if (link.startsWith('/stores')) navigationRef.navigate('Main', { screen: 'Stores' });
  else navigationRef.navigate('Main', { screen: 'Dashboard' });
}

// Bottom tabs are capped at 5 — platform guidance (and what actually fits
// without labels wrapping/overlapping on a normal phone width). Everything
// past Dashboard/MRS/Stores/Bills lives one tap deeper, under "More".
function MoreStackScreen() {
  return (
    <MoreStack.Navigator screenOptions={{ headerShown: false }}>
      <MoreStack.Screen name="MoreHome" component={MoreScreen} />
      <MoreStack.Screen name="Assets" component={AssetsScreen} />
      <MoreStack.Screen name="Documents" component={DocumentsScreen} />
      <MoreStack.Screen name="ESS" component={ESSScreen} />
      <MoreStack.Screen name="Profile" component={ProfileScreen} />
    </MoreStack.Navigator>
  );
}

function Tabs() {
  const insets = useSafeAreaInsets();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.muted,
        tabBarLabelStyle: { fontSize: 11 },
        tabBarStyle: {
          height: 54 + insets.bottom,
          paddingBottom: Math.max(6, insets.bottom),
          paddingTop: 6,
          borderTopColor: theme.colors.border,
        },
        tabBarIcon: ({ color, size }) => {
          const icons = {
            Dashboard: 'grid-outline',
            MRS: 'clipboard-outline',
            Stores: 'cube-outline',
            Bills: 'receipt-outline',
            More: 'menu-outline',
          };
          return <Ionicons name={icons[route.name]} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="MRS" component={MaterialRequestScreen} />
      <Tab.Screen name="Stores" component={StoresScreen} />
      <Tab.Screen name="Bills" component={BillsScreen} />
      <Tab.Screen name="More" component={MoreStackScreen} />
    </Tab.Navigator>
  );
}

function RootNavigator() {
  const { booting, user, selectedProject } = useAuth();

  useEffect(() => {
    const sub = addNotificationResponseListener(navigateForLink);
    return () => sub.remove();
  }, []);

  if (booting) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.bg }}>
        <ActivityIndicator color={theme.colors.primary} size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!user ? (
          <Stack.Screen name="Login" component={LoginScreen} />
        ) : !selectedProject ? (
          <Stack.Screen name="ProjectSelect" component={ProjectSelectScreen} />
        ) : (
          <Stack.Screen name="Main" component={Tabs} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="light" />
        <RootNavigator />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
