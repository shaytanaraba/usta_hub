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

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log(`${LOG_PREFIX} Auth state changed: ${event}`);

      if (event === 'SIGNED_OUT') {
        setUser(null);
      } else if (session?.user) {
        const currentUser = await authService.getCurrentUser();
        setUser(currentUser);
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

  const getInitialScreen = (role) => {
    switch (role) {
      case 'master': return 'MasterDashboard';
      case 'dispatcher': return 'DispatcherDashboard';
      case 'admin': return 'AdminDashboard';
      case 'client': return 'Login'; // Clients hidden for now
      default: return 'Login';
    }
  };

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Login"
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
          contentStyle: { backgroundColor: '#0f172a' }
        }}
      >
        {/* Login - Always available */}
        <Stack.Screen
          name="Login"
          component={LoginScreen}
          options={{ animationTypeForReplace: 'pop' }}
        />

        {/* Master Dashboard */}
        <Stack.Screen
          name="MasterDashboard"
          component={MasterDashboard}
          initialParams={{ user }}
        />

        {/* Dispatcher Dashboard */}
        <Stack.Screen
          name="DispatcherDashboard"
          component={DispatcherDashboard}
          initialParams={{ user }}
        />

        {/* Admin Dashboard */}
        <Stack.Screen
          name="AdminDashboard"
          component={AdminDashboard}
          initialParams={{ user }}
        />
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