import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import Ionicons from '@expo/vector-icons/Ionicons';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from './src/context/AuthContext';
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

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.muted,
        tabBarStyle: {
          height: 64,
          paddingBottom: 8,
          paddingTop: 8,
          borderTopColor: theme.colors.border
        },
        tabBarIcon: ({ color, size }) => {
          const icons = {
            Dashboard: 'grid-outline',
            MRS: 'clipboard-outline',
            Stores: 'cube-outline',
            Bills: 'receipt-outline',
            Assets: 'qr-code-outline',
            Docs: 'folder-open-outline',
            ESS: 'person-check-outline',
            Profile: 'person-circle-outline'
          };
          return <Ionicons name={icons[route.name]} size={size} color={color} />;
        }
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="MRS" component={MaterialRequestScreen} />
      <Tab.Screen name="Stores" component={StoresScreen} />
      <Tab.Screen name="Bills" component={BillsScreen} />
      <Tab.Screen name="ESS" component={ESSScreen} />
      <Tab.Screen name="Assets" component={AssetsScreen} />
      <Tab.Screen name="Docs" component={DocumentsScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

function RootNavigator() {
  const { booting, user, selectedProject } = useAuth();

  if (booting) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.bg }}>
        <ActivityIndicator color={theme.colors.primary} size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer>
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
    <AuthProvider>
      <StatusBar style="light" />
      <RootNavigator />
    </AuthProvider>
  );
}
