// Force rebuild
import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View, StyleSheet } from 'react-native';

// Import screens
import LoginScreen from './src/screens/LoginScreen';
import ClientDashboard from './src/screens/ClientDashboard';
import PlumberDashboard from './src/screens/PlumberDashboard';
import AdminDashboard from './src/screens/AdminDashboard';
import PlumberProfileSettings from './src/screens/PlumberProfileSettings';

// Import services
import auth from './src/services/auth';
import { supabase } from './src/lib/supabase';

// Import context
import { ToastProvider } from './src/contexts/ToastContext';

const Stack = createNativeStackNavigator();

function AppNavigator() {
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState(null);

  useEffect(() => {
    // Check for existing session
    initializeApp();

    // Listen for auth state changes (fixes session persistence)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('Auth state changed:', event);
        if (session) {
          const profile = await auth.getCurrentUser();
          setUser(profile);
        } else {
          setUser(null);
        }
        setIsLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const initializeApp = async () => {
    console.log('🚀 Initializing app...');
    try {
      const currentUser = await auth.getCurrentUser();
      console.log('👤 Current user:', currentUser);
      setUser(currentUser);
    } catch (error) {
      console.error('❌ Error initializing app:', error);
    } finally {
      console.log('✅ App initialization complete');
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007bff" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName={user ? getInitialScreen(user.user_type) : 'Login'}
        screenOptions={{
          headerShown: false,
        }}
      >
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="ClientDashboard" component={ClientDashboard} />
        <Stack.Screen name="PlumberDashboard" component={PlumberDashboard} />
        <Stack.Screen name="AdminDashboard" component={AdminDashboard} />
        <Stack.Screen name="PlumberProfileSettings" component={PlumberProfileSettings} />
      </Stack.Navigator>
      <StatusBar style="auto" />
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AppNavigator />
    </ToastProvider>
  );
}

function getInitialScreen(userType) {
  switch (userType) {
    case 'client':
      return 'ClientDashboard';
    case 'plumber':
      return 'PlumberDashboard';
    case 'admin':
      return 'AdminDashboard';
    default:
      return 'Login';
  }
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
});