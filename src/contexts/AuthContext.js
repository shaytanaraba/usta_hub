import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { supabase } from '../lib/supabase';
import authService from '../services/auth';

const AuthContext = createContext(null);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const refreshInFlight = useRef(null);

  const refreshSession = useCallback(async (options = {}) => {
    if (refreshInFlight.current) {
      return refreshInFlight.current;
    }

    refreshInFlight.current = (async () => {
      const { data: { session: activeSession } } = await supabase.auth.getSession();
      setSession(activeSession || null);

      if (!activeSession?.user) {
        setUser(null);
        return null;
      }

      const retries = Number.isInteger(options.retries) ? options.retries : 2;
      const retryDelayMs = Number.isInteger(options.retryDelayMs) ? options.retryDelayMs : 350;
      let attempt = 0;
      let currentUser = null;
      while (attempt <= retries) {
        currentUser = await authService.getCurrentUser();
        if (currentUser) break;
        attempt += 1;
        if (attempt <= retries) {
          await sleep(retryDelayMs);
        }
      }

      setUser(currentUser);
      return currentUser;
    })();

    const result = await refreshInFlight.current;
    refreshInFlight.current = null;
    return result;
  }, []);

  const logout = useCallback(async (options = {}) => {
    const result = await authService.logoutUser(options);
    setSession(null);
    setUser(null);
    return result;
  }, []);

  useEffect(() => {
    let mounted = true;

    const initialize = async () => {
      await refreshSession({ retries: 2, retryDelayMs: 400 });
      if (mounted) setLoading(false);
    };

    initialize();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, nextSession) => {
      setSession(nextSession || null);
      if (event === 'SIGNED_OUT') {
        setUser(null);
        return;
      }
      if (nextSession?.user) {
        await refreshSession({ retries: 1, retryDelayMs: 300 });
      }
    });

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, [refreshSession]);

  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const handleVisibility = () => {
        if (document.visibilityState === 'visible') {
          refreshSession({ retries: 1, retryDelayMs: 300 });
        }
      };
      document.addEventListener('visibilitychange', handleVisibility);
      return () => document.removeEventListener('visibilitychange', handleVisibility);
    }

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        refreshSession({ retries: 1, retryDelayMs: 300 });
      }
    });

    return () => subscription?.remove();
  }, [refreshSession]);

  const value = useMemo(() => ({
    user,
    session,
    loading,
    refreshSession,
    logout,
  }), [loading, logout, refreshSession, session, user]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
