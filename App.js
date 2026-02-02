/**
 * Master KG v5 - Main Application Entry
 * Dispatcher-mediated architecture with role-based routing
 */

import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { ToastProvider } from './src/contexts/ToastContext';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { NavigationHistoryProvider, useNavHistory } from './src/contexts/NavigationHistoryContext';

// Screens
import LoginScreen from './src/screens/LoginScreen';
import MasterDashboard from './src/screens/MasterDashboard';
import DispatcherDashboard from './src/screens/DispatcherDashboard';
import AdminDashboard from './src/screens/AdminDashboard';

const Stack = createNativeStackNavigator();

// Loading screen component
function LoadingScreen() {
  return (
    <LinearGradient colors={['#0f172a', '#1e293b']} style={styles.loadingContainer}>
      <ActivityIndicator size="large" color="#3b82f6" />
    </LinearGradient>
  );
}

function AppNavigator() {
  const { user, session, loading } = useAuth();
  const { navRef, onStateChange, resetHistory } = useNavHistory();

  const syncRoute = () => {
    if (!navRef.isReady()) return;
    if (session?.user && !user) return;
    const target = user?.role === 'master'
      ? 'MasterDashboard'
      : user?.role === 'dispatcher'
        ? 'DispatcherDashboard'
        : user?.role === 'admin'
          ? 'AdminDashboard'
          : 'Login';
    const current = navRef.getCurrentRoute()?.name;
    if (current !== target) {
      const params = user ? { user } : undefined;
      navRef.reset({ index: 0, routes: [{ name: target, params }] });
      resetHistory({ name: target, params });
    }
  };

  useEffect(() => {
    syncRoute();
  }, [user]);

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <NavigationContainer ref={navRef} onStateChange={onStateChange} onReady={syncRoute}>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
          contentStyle: { backgroundColor: '#0f172a' }
        }}
      >
        <Stack.Screen
          name="Login"
          component={LoginScreen}
          options={{ animationTypeForReplace: 'pop' }}
        />
        <Stack.Screen name="MasterDashboard" component={MasterDashboard} />
        <Stack.Screen name="DispatcherDashboard" component={DispatcherDashboard} />
        <Stack.Screen name="AdminDashboard" component={AdminDashboard} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

import { LocalizationProvider } from './src/contexts/LocalizationContext';

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <NavigationHistoryProvider>
          <LocalizationProvider>
            <StatusBar style="light" />
            <AppNavigator />
          </LocalizationProvider>
        </NavigationHistoryProvider>
      </AuthProvider>
    </ToastProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
