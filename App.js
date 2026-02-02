/**
 * Master KG v5 - Main Application Entry
 * Dispatcher-mediated architecture with role-based routing
 */

import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, StyleSheet, Text, TouchableOpacity } from 'react-native';
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
const TELEGRAM_LOADING_TIMEOUT_MS = 10000;

const getTelegramWebApp = () => {
  if (typeof window === 'undefined') return null;
  return window.Telegram?.WebApp || null;
};

const isTelegramWebApp = () => Boolean(getTelegramWebApp());

// Loading screen component
function LoadingScreen() {
  return (
    <LinearGradient colors={['#0f172a', '#1e293b']} style={styles.loadingContainer}>
      <ActivityIndicator size="large" color="#3b82f6" />
    </LinearGradient>
  );
}

function TelegramLoadingFallback({ onRetry, onReset }) {
  return (
    <LinearGradient colors={['#0f172a', '#1e293b']} style={styles.loadingContainer}>
      <View style={styles.fallbackCard}>
        <Text style={styles.fallbackTitle}>Still loading...</Text>
        <Text style={styles.fallbackText}>
          If the mini app is stuck, try retrying or reset app data.
        </Text>
        <TouchableOpacity style={styles.fallbackButton} onPress={onRetry}>
          <Text style={styles.fallbackButtonText}>Retry</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.fallbackButton, styles.fallbackButtonSecondary]} onPress={onReset}>
          <Text style={styles.fallbackButtonText}>Reset app data</Text>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}

function AppNavigator() {
  const { user, session, loading, refreshSession, resetAppData } = useAuth();
  const { navRef, onStateChange, resetHistory } = useNavHistory();
  const [loadingTimeout, setLoadingTimeout] = useState(false);
  const telegramActive = isTelegramWebApp();

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

  useEffect(() => {
    if (!telegramActive || !loading) {
      setLoadingTimeout(false);
      return;
    }
    const timer = setTimeout(() => setLoadingTimeout(true), TELEGRAM_LOADING_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [loading, telegramActive]);

  const handleRetry = async () => {
    setLoadingTimeout(false);
    await refreshSession({ retries: 2, retryDelayMs: 400, minIntervalMs: 0 });
  };

  const handleReset = async () => {
    await resetAppData();
  };

  if (loading) {
    if (telegramActive && loadingTimeout) {
      return <TelegramLoadingFallback onRetry={handleRetry} onReset={handleReset} />;
    }
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
  useEffect(() => {
    const tg = getTelegramWebApp();
    if (tg?.ready) {
      try {
        tg.ready();
      } catch (error) {
        console.warn('[Telegram] WebApp.ready failed', error);
      }
    }
  }, []);

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
  fallbackCard: {
    paddingHorizontal: 24,
    paddingVertical: 20,
    borderRadius: 16,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.3)',
    width: '80%',
    maxWidth: 420,
    gap: 12,
  },
  fallbackTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f8fafc',
    textAlign: 'center',
  },
  fallbackText: {
    fontSize: 13,
    color: '#cbd5f5',
    textAlign: 'center',
    lineHeight: 18,
  },
  fallbackButton: {
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#3b82f6',
    alignItems: 'center',
  },
  fallbackButtonSecondary: {
    backgroundColor: '#475569',
  },
  fallbackButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
});
