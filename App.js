/**
 * Master KG v5 - Main Application Entry
 * Dispatcher-mediated architecture with role-based routing
 */

import React, { useEffect, useRef, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, StyleSheet, Text, TouchableOpacity, LogBox } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { ToastProvider } from './src/contexts/ToastContext';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { NavigationHistoryProvider, useNavHistory } from './src/contexts/NavigationHistoryContext';

// Screens
import LoginScreen from './src/screens/LoginScreen';
import MasterDashboard from './src/screens/MasterDashboard';
import DispatcherDashboard from './src/screens/DispatcherDashboard';
import PartnerDashboard from './src/screens/PartnerDashboard';
import AdminDashboard from './src/screens/AdminDashboard';

const Stack = createNativeStackNavigator();
const LOADING_TIMEOUT_MS = 10000;
const PROFILE_RESOLUTION_RETRY_INTERVAL_MS = 3000;
const PROFILE_RESOLUTION_MAX_RETRIES = 4;
const PROFILE_RECOVERY_RESET_TIMEOUT_MS = 9000;
const APP_AUTH_DIAG_ENABLED = process?.env?.EXPO_PUBLIC_ENABLE_AUTH_DIAGNOSTICS === '1';
const appAuthDiag = (...args) => {
  if (APP_AUTH_DIAG_ENABLED) {
    console.log('[AppNavigator][Diag]', ...args);
  }
};

const getTelegramWebApp = () => {
  if (typeof window === 'undefined') return null;
  return window.Telegram?.WebApp || null;
};

// Loading screen component
function LoadingScreen() {
  return (
    <LinearGradient colors={['#0f172a', '#1e293b']} style={styles.loadingContainer}>
      <ActivityIndicator size="large" color="#3b82f6" />
    </LinearGradient>
  );
}

function LoadingFallback({ onRetry, onReset }) {
  return (
    <LinearGradient colors={['#0f172a', '#1e293b']} style={styles.loadingContainer}>
      <View style={styles.fallbackCard}>
        <Text style={styles.fallbackTitle}>Still loading...</Text>
        <Text style={styles.fallbackText}>
          If the app is stuck, try retrying or reset app data.
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
  const [profileBootstrapFailed, setProfileBootstrapFailed] = useState(false);
  const profileRetryCountRef = useRef(0);
  const profileRefreshInFlightRef = useRef(false);
  const profileResetTriggeredRef = useRef(false);
  const waitingForProfile = !loading && !!session?.user && !user && !profileBootstrapFailed;
  const isBootstrapping = loading || waitingForProfile;

  const syncRoute = () => {
    if (!navRef.isReady()) return;
    if (session?.user && !user && !profileBootstrapFailed) return;
    const target = user?.role === 'master'
      ? 'MasterDashboard'
      : user?.role === 'dispatcher'
        ? 'DispatcherDashboard'
        : user?.role === 'partner'
          ? 'PartnerDashboard'
        : user?.role === 'admin'
          ? 'AdminDashboard'
          : 'Login';
    const currentRoute = navRef.getCurrentRoute();
    const current = currentRoute?.name;
    const currentUserId = currentRoute?.params?.user?.id || null;
    const nextUserId = user?.id || null;
    const sameScreenDifferentUser = current === target
      && target !== 'Login'
      && !!nextUserId
      && currentUserId !== nextUserId;
    if (current !== target || sameScreenDifferentUser) {
      const params = user ? { user } : undefined;
      navRef.reset({ index: 0, routes: [{ name: target, params }] });
      resetHistory({ name: target, params });
    }
  };

  useEffect(() => {
    syncRoute();
  }, [profileBootstrapFailed, session, user]);

  useEffect(() => {
    if (!loading && (!session?.user || !!user)) {
      setProfileBootstrapFailed(false);
    }
  }, [loading, session?.user, user]);

  useEffect(() => {
    if (!isBootstrapping) {
      setLoadingTimeout(false);
      return;
    }
    const timer = setTimeout(() => setLoadingTimeout(true), LOADING_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [isBootstrapping]);

  useEffect(() => {
    if (!waitingForProfile) {
      profileRetryCountRef.current = 0;
      profileRefreshInFlightRef.current = false;
      profileResetTriggeredRef.current = false;
    }
  }, [waitingForProfile]);

  useEffect(() => {
    if (!waitingForProfile) return undefined;
    let canceled = false;

    const forceResetAfterRetries = async (reason, error = null) => {
      if (canceled || profileResetTriggeredRef.current) return;
      profileResetTriggeredRef.current = true;
      setProfileBootstrapFailed(true);
      console.error('[AppNavigator] Profile resolution exceeded retry cap, resetting auth state', {
        reason,
        attempts: profileRetryCountRef.current,
        error: error?.message || null,
      });
      try {
        const resetResult = await Promise.race([
          resetAppData().then(() => 'ok'),
          new Promise((resolve) => setTimeout(() => resolve('__reset_timeout__'), PROFILE_RECOVERY_RESET_TIMEOUT_MS)),
        ]);
        if (resetResult === '__reset_timeout__') {
          console.warn('[AppNavigator] resetAppData timed out; continuing with login fallback');
        }
      } catch (resetError) {
        console.error('[AppNavigator] resetAppData failed after profile retry cap', resetError);
      }
    };

    const resolveProfile = async () => {
      if (canceled || profileRefreshInFlightRef.current) return;
      const attempt = profileRetryCountRef.current + 1;
      profileRetryCountRef.current = attempt;
      if (attempt > PROFILE_RESOLUTION_MAX_RETRIES) {
        await forceResetAfterRetries('retry_limit');
        return;
      }
      profileRefreshInFlightRef.current = true;
      appAuthDiag('resolve_profile_attempt', { attempt });
      try {
        await refreshSession({ retries: 2, retryDelayMs: 400, minIntervalMs: 0 });
      } catch (error) {
        console.error('[AppNavigator] resolveProfile attempt failed', {
          attempt,
          message: error?.message || String(error),
        });
      } finally {
        profileRefreshInFlightRef.current = false;
      }
    };

    resolveProfile();
    const timer = setInterval(() => {
      if (!canceled) resolveProfile();
    }, PROFILE_RESOLUTION_RETRY_INTERVAL_MS);

    return () => {
      canceled = true;
      clearInterval(timer);
    };
  }, [refreshSession, resetAppData, waitingForProfile]);

  const handleRetry = async () => {
    setProfileBootstrapFailed(false);
    profileRetryCountRef.current = 0;
    profileResetTriggeredRef.current = false;
    setLoadingTimeout(false);
    await refreshSession({ retries: 2, retryDelayMs: 400, minIntervalMs: 0 });
  };

  const handleReset = async () => {
    setProfileBootstrapFailed(false);
    await resetAppData();
  };

  if (isBootstrapping) {
    if (loadingTimeout) {
      return <LoadingFallback onRetry={handleRetry} onReset={handleReset} />;
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
        <Stack.Screen name="PartnerDashboard" component={PartnerDashboard} />
        <Stack.Screen name="AdminDashboard" component={AdminDashboard} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

import { LocalizationProvider } from './src/contexts/LocalizationContext';

export default function App() {
  useEffect(() => {
    const ignoredLogs = [
      'It looks like you might be using shared value',
      'Source map error',
      'Source Map URL',
      'props.pointerEvents is deprecated. Use style.pointerEvents',
      "'shadow*' style props are deprecated. Use \"boxShadow\".",
      'installHook.js.map',
    ];

    LogBox.ignoreLogs(ignoredLogs);

    const originalWarn = console.warn;
    const originalError = console.error;

    console.warn = (...args) => {
      if (typeof args[0] === 'string' && ignoredLogs.some(msg => args[0].includes(msg))) {
        return;
      }
      originalWarn(...args);
    };

    console.error = (...args) => {
      if (typeof args[0] === 'string' && ignoredLogs.some(msg => args[0].includes(msg))) {
        return;
      }
      originalError(...args);
    };

    return () => {
      console.warn = originalWarn;
      console.error = originalError;
    };
  }, []);

  useEffect(() => {
    let attempts = 0;
    const tryReady = () => {
      const tg = getTelegramWebApp();
      if (tg?.ready) {
        try {
          tg.ready();
          return true;
        } catch (error) {
          console.warn('[Telegram] WebApp.ready failed', error);
        }
      }
      return false;
    };

    if (tryReady()) return undefined;

    const interval = setInterval(() => {
      attempts += 1;
      if (tryReady() || attempts >= 20) {
        clearInterval(interval);
      }
    }, 250);

    return () => clearInterval(interval);
  }, []);

  return (
    <ToastProvider>
      <LocalizationProvider>
        <AuthProvider>
          <NavigationHistoryProvider>
            <StatusBar style="light" />
            <AppNavigator />
          </NavigationHistoryProvider>
        </AuthProvider>
      </LocalizationProvider>
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
