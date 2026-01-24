/**
 * Master KG v5 - Main Application Entry
 * Dispatcher-mediated architecture with role-based routing
 */

import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { supabase } from './src/lib/supabase';
import authService from './src/services/auth';
import { ToastProvider } from './src/contexts/ToastContext';

// Screens
import LoginScreen from './src/screens/LoginScreen';
import MasterDashboard from './src/screens/MasterDashboard';
import DispatcherDashboard from './src/screens/DispatcherDashboard';
import AdminDashboard from './src/screens/AdminDashboard';

const Stack = createNativeStackNavigator();

const LOG_PREFIX = '[App]';

// Loading screen component
function LoadingScreen() {
  return (
    <LinearGradient colors={['#0f172a', '#1e293b']} style={styles.loadingContainer}>
      <ActivityIndicator size="large" color="#3b82f6" />
    </LinearGradient>
  );
}

function AppNavigator() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log(`${LOG_PREFIX} Initializing app...`);
    checkUser();

    // Listen for auth state changes - handles session persistence and token refresh
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log(`${LOG_PREFIX} Auth state changed: ${event}`);

      switch (event) {
        case 'SIGNED_OUT':
          console.log(`${LOG_PREFIX} User signed out, clearing state`);
          setUser(null);
          break;

        case 'SIGNED_IN':
        case 'TOKEN_REFRESHED':
        case 'USER_UPDATED':
          // Refresh user data when session changes or token refreshes
          if (session?.user) {
            console.log(`${LOG_PREFIX} Session active, refreshing user data...`);
            // Only fetch if we don't have the user or if it's a legitimate refresh
            // Optimization: could check if user ID matches to avoid re-fetch on every token refresh
            const currentUser = await authService.getCurrentUser();
            setUser(currentUser);
          }
          break;

        case 'INITIAL_SESSION':
          if (session?.user) {
            console.log(`${LOG_PREFIX} Restoring session from storage...`);
            const currentUser = await authService.getCurrentUser();
            setUser(currentUser);
          }
          break;

        default:
          console.log(`${LOG_PREFIX} Unhandled auth event: ${event}`);
      }
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  const checkUser = async () => {
    try {
      const currentUser = await authService.getCurrentUser();
      console.log(`${LOG_PREFIX} Current user:`, currentUser?.full_name || 'None');
      setUser(currentUser);
    } catch (error) {
      console.error(`${LOG_PREFIX} checkUser error:`, error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
          contentStyle: { backgroundColor: '#0f172a' }
        }}
      >
        {!user ? (
          // Authenticated: Show Dashboard based on Role
          <Stack.Screen
            name="Login"
            component={LoginScreen}
            options={{ animationTypeForReplace: 'pop' }}
          />
        ) : (
          // Authenticated: Show Dashboard based on Role
          <>
            {user.role === 'master' && (
              <Stack.Screen name="MasterDashboard" component={MasterDashboard} initialParams={{ user }} />
            )}
            {user.role === 'dispatcher' && (
              <Stack.Screen name="DispatcherDashboard" component={DispatcherDashboard} initialParams={{ user }} />
            )}
            {user.role === 'admin' && (
              <Stack.Screen name="AdminDashboard" component={AdminDashboard} initialParams={{ user }} />
            )}

            {/* Fallback for unknown roles - arguably shouldn't happen due to Login checks */}
            {/* If role doesn't match, we might want to fallback to Login or show Error, 
                but for now we assume role is valid from authService */}
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

import { LocalizationProvider } from './src/contexts/LocalizationContext';

export default function App() {
  return (
    <ToastProvider>
      <LocalizationProvider>
        <StatusBar style="light" />
        <AppNavigator />
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
});