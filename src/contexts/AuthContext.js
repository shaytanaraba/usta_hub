import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from '../lib/supabase';
import authService from '../services/auth';
import { useToast } from './ToastContext';
import { useLocalization } from './LocalizationContext';

const AuthContext = createContext(null);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const LAST_ACTIVE_KEY = 'auth_last_active_at';
// Default inactivity timeout (applies to all roles). You can later customize per role.
const INACTIVITY_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 hours
// If you want different timeouts for web vs native, use these values instead:
// const INACTIVITY_TIMEOUT_MS_WEB = 2 * 60 * 60 * 1000;
// const INACTIVITY_TIMEOUT_MS_NATIVE = 2 * 60 * 60 * 1000;
// Throttle refreshes when app/tab becomes active.
const REFRESH_MIN_INTERVAL_MS = 30 * 1000; // 30 seconds
// Keep sessions warm to avoid first-action stalls after long idle/sleep.
const SESSION_HEARTBEAT_MS = 5 * 60 * 1000; // 5 minutes
// Guard against rare unresolved auth promises that can freeze app bootstrap.
const INITIAL_REFRESH_TIMEOUT_MS = 12000;
const REFRESH_HARD_TIMEOUT_MS = 12000;

const isWeb = Platform.OS === 'web' && typeof window !== 'undefined' && typeof localStorage !== 'undefined';
const memoryStorage = new Map();
const isAuthInvalidError = (error) => {
  const message = error?.message?.toLowerCase?.() || '';
  const status = error?.status;
  return status === 401
    || message.includes('jwt expired')
    || message.includes('invalid jwt')
    || message.includes('invalid token')
    || message.includes('auth session missing')
    || message.includes('token has expired')
    || message.includes('refresh token');
};
const isTransientError = (error) => {
  const message = error?.message?.toLowerCase?.() || '';
  return error?.code === 'SUPABASE_TIMEOUT'
    || error?.name === 'SupabaseTimeoutError'
    || message.includes('request timed out')
    || message.includes('the operation was aborted')
    || message.includes('aborterror')
    || message.includes('network request failed')
    || message.includes('failed to fetch')
    || message.includes('timeout')
    || message.includes('temporarily unavailable')
    || message.includes('econnreset')
    || message.includes('eai_again');
};
const isTimeoutError = (error) => {
  const message = error?.message?.toLowerCase?.() || '';
  return error?.code === 'SUPABASE_TIMEOUT'
    || error?.name === 'SupabaseTimeoutError'
    || message.includes('request timed out')
    || message.includes('the operation was aborted')
    || message.includes('aborterror');
};
const toAuthIssueKey = (error) => {
  const message = error?.message?.toLowerCase?.() || '';
  if (isAuthInvalidError(error)) return 'session_expired';
  if (isTimeoutError(error)) return 'timeout';
  return message.includes('network request failed')
    || message.includes('failed to fetch')
    || message.includes('temporarily unavailable')
    || message.includes('econnreset')
    || message.includes('eai_again')
    ? 'network'
    : null;
};
const clearSupabaseWebStorage = async () => {
  if (!isWeb) return;
  try {
    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
        localStorage.removeItem(key);
      }
    });
  } catch (error) {
    console.warn('[Auth] Failed to clear Supabase web storage', error);
  }
};
const clearSupabaseNativeStorage = async () => {
  if (isWeb) return;
  try {
    const keys = await AsyncStorage.getAllKeys();
    const authKeys = keys.filter((key) => key.startsWith('sb-') && key.endsWith('-auth-token'));
    if (authKeys.length > 0) {
      await AsyncStorage.multiRemove(authKeys);
    }
  } catch (error) {
    console.warn('[Auth] Failed to clear Supabase native storage', error);
  }
};
const activityStorage = {
  getItem: async (key) => {
    if (!isWeb) return AsyncStorage.getItem(key);
    try {
      return localStorage.getItem(key);
    } catch (error) {
      console.warn('[Auth] localStorage.getItem failed, using memory store', error);
      return memoryStorage.has(key) ? memoryStorage.get(key) : null;
    }
  },
  setItem: async (key, value) => {
    if (!isWeb) return AsyncStorage.setItem(key, value);
    try {
      localStorage.setItem(key, value);
    } catch (error) {
      console.warn('[Auth] localStorage.setItem failed, using memory store', error);
      memoryStorage.set(key, value);
    }
  },
  removeItem: async (key) => {
    if (!isWeb) return AsyncStorage.removeItem(key);
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.warn('[Auth] localStorage.removeItem failed, using memory store', error);
      memoryStorage.delete(key);
    }
  },
};

export function AuthProvider({ children }) {
  const { showToast } = useToast();
  const { t } = useLocalization();
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const latestUserRef = useRef(null);
  const refreshInFlight = useRef(null);
  const refreshVersionRef = useRef(0);
  const resumeRefreshInFlightRef = useRef(false);
  const lastRefreshRef = useRef(0);
  const lastActivityRef = useRef(Date.now());
  const lastInteractionRefreshRef = useRef(0);
  const lastAuthIssueToastRef = useRef({ key: '', at: 0 });

  useEffect(() => {
    latestUserRef.current = user;
  }, [user]);

  const notifyAuthIssue = useCallback((key) => {
    if (!key || !showToast) return;
    const now = Date.now();
    const cooldownMs = key === 'session_expired' ? 5000 : 15000;
    const prev = lastAuthIssueToastRef.current;
    if (prev.key === key && now - prev.at < cooldownMs) return;
    lastAuthIssueToastRef.current = { key, at: now };

    if (key === 'session_expired') {
      showToast(
        t('authSessionExpired') || 'Your session expired. Please sign in again.',
        'warning',
        5000
      );
      return;
    }
    if (key === 'timeout') {
      showToast(
        t('authRequestTimedOut') || 'Request timed out. Please check your connection and retry.',
        'warning',
        4500
      );
      return;
    }
    if (key === 'network') {
      showToast(
        t('authNetworkRetrying') || 'Network issue detected. Retrying session in background.',
        'info',
        3500
      );
    }
  }, [showToast, t]);

  const refreshSession = useCallback(async (options = {}) => {
    const minIntervalMs = Number.isInteger(options.minIntervalMs) ? options.minIntervalMs : 0;
    if (!refreshInFlight.current) {
      const now = Date.now();
      if (minIntervalMs > 0 && now - lastRefreshRef.current < minIntervalMs) {
        return latestUserRef.current;
      }

      const refreshVersion = refreshVersionRef.current + 1;
      refreshVersionRef.current = refreshVersion;

      const refreshPromise = (async () => {
        const isStaleRefresh = () => refreshVersion !== refreshVersionRef.current;
        try {
          lastRefreshRef.current = Date.now();
          const { data: { session: activeSession }, error: sessionError } = await supabase.auth.getSession();
          if (isStaleRefresh()) {
            return latestUserRef.current || null;
          }
          if (sessionError) {
            if (isAuthInvalidError(sessionError)) {
              notifyAuthIssue('session_expired');
              try { await supabase.auth.signOut({ scope: 'local' }); } catch (e) {}
              if (!isStaleRefresh()) {
                setSession(null);
                setUser(null);
              }
              return null;
            }
            notifyAuthIssue(toAuthIssueKey(sessionError));
            console.warn('[Auth] getSession error', sessionError);
          }

          if (!isStaleRefresh()) {
            setSession(activeSession || null);
          }

          if (!activeSession?.user) {
            if (!isStaleRefresh()) {
              setUser(null);
            }
            return null;
          }

          const retries = Number.isInteger(options.retries) ? options.retries : 2;
          const retryDelayMs = Number.isInteger(options.retryDelayMs) ? options.retryDelayMs : 350;
          let attempt = 0;
          let currentUser = null;
          while (attempt <= retries) {
            currentUser = await authService.getCurrentUser({ session: activeSession });
            if (currentUser || isStaleRefresh()) break;
            attempt += 1;
            if (attempt <= retries) {
              await sleep(retryDelayMs);
            }
          }

          if (isStaleRefresh()) {
            return latestUserRef.current || null;
          }

          if (currentUser) {
            setUser(currentUser);
            return currentUser;
          }

          // Keep existing user on transient failures to avoid random logouts.
          if (latestUserRef.current) return latestUserRef.current;

          setUser(null);
          return null;
        } catch (error) {
          if (isStaleRefresh()) {
            return latestUserRef.current || null;
          }
          console.error('[Auth] refreshSession failed', error);
          if (isAuthInvalidError(error)) {
            notifyAuthIssue('session_expired');
            try { await supabase.auth.signOut({ scope: 'local' }); } catch (e) {}
            setSession(null);
            setUser(null);
            return null;
          }
          if (isTransientError(error)) {
            notifyAuthIssue(toAuthIssueKey(error));
            return latestUserRef.current;
          }
          setSession(null);
          setUser(null);
          return null;
        }
      })();

      refreshInFlight.current = refreshPromise;
      refreshPromise.finally(() => {
        if (refreshInFlight.current === refreshPromise) {
          refreshInFlight.current = null;
        }
      });
    }

    let result = null;
    const activeRefreshPromise = refreshInFlight.current;
    const timeoutToken = '__refresh_timeout__';
    result = await Promise.race([
      activeRefreshPromise,
      sleep(REFRESH_HARD_TIMEOUT_MS).then(() => timeoutToken),
    ]);
    if (result === timeoutToken) {
      console.warn('[Auth] refreshSession timed out');
      notifyAuthIssue('timeout');
      if (refreshInFlight.current === activeRefreshPromise) {
        refreshVersionRef.current += 1;
        refreshInFlight.current = null;
      }
      return latestUserRef.current || null;
    }
    return result;
  }, [notifyAuthIssue]);

  const logout = useCallback(async (options = {}) => {
    refreshVersionRef.current += 1;
    refreshInFlight.current = null;
    const result = await authService.logoutUser(options);
    setSession(null);
    setUser(null);
    await activityStorage.removeItem(LAST_ACTIVE_KEY);
    return result;
  }, []);

  const resetAppData = useCallback(async () => {
    await logout({ scope: 'local' });
    await clearSupabaseWebStorage();
    await clearSupabaseNativeStorage();
  }, [logout]);

  const recordActivity = useCallback(async () => {
    const now = Date.now();
    lastActivityRef.current = now;
    await activityStorage.setItem(LAST_ACTIVE_KEY, String(now));
  }, []);

  const checkInactivity = useCallback(async () => {
    try {
      const stored = await activityStorage.getItem(LAST_ACTIVE_KEY);
      if (!stored) {
        await recordActivity();
        return false;
      }
      const lastActiveAt = Number(stored);
      if (!Number.isFinite(lastActiveAt)) {
        await recordActivity();
        return false;
      }
      const elapsed = Date.now() - lastActiveAt;
      // If you want per-role timeouts, swap INACTIVITY_TIMEOUT_MS for a lookup by user?.role.
      if (elapsed > INACTIVITY_TIMEOUT_MS) {
        await logout({ scope: 'local' });
        return true;
      }
      return false;
    } catch (error) {
      console.warn('[Auth] checkInactivity failed', error);
      return false;
    }
  }, [logout, recordActivity]);

  const handleAppResume = useCallback(async () => {
    if (resumeRefreshInFlightRef.current) return;
    resumeRefreshInFlightRef.current = true;
    try {
      const expired = await checkInactivity();
      if (expired) return;
      await recordActivity();
      await refreshSession({ retries: 1, retryDelayMs: 300, minIntervalMs: REFRESH_MIN_INTERVAL_MS });
    } finally {
      resumeRefreshInFlightRef.current = false;
    }
  }, [checkInactivity, recordActivity, refreshSession]);

  useEffect(() => {
    let mounted = true;

    const initialize = async () => {
      try {
        await checkInactivity();
        const initResult = await Promise.race([
          refreshSession({ retries: 2, retryDelayMs: 400 }),
          sleep(INITIAL_REFRESH_TIMEOUT_MS).then(() => '__init_timeout__'),
        ]);
        if (initResult === '__init_timeout__') {
          console.warn('[Auth] initialization refresh timed out');
          notifyAuthIssue('timeout');
        }
      } catch (error) {
        console.error('[Auth] initialization failed', error);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    initialize();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, nextSession) => {
      setSession(nextSession || null);
      if (event === 'SIGNED_OUT') {
        refreshVersionRef.current += 1;
        refreshInFlight.current = null;
        setUser(null);
        await activityStorage.removeItem(LAST_ACTIVE_KEY);
        return;
      }
      if (nextSession?.user) {
        await recordActivity();
        await refreshSession({ retries: 1, retryDelayMs: 300 });
      }
    });

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, [checkInactivity, notifyAuthIssue, recordActivity, refreshSession]);

  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const handleVisibility = () => {
        if (document.visibilityState === 'visible') {
          handleAppResume();
        }
      };
      document.addEventListener('visibilitychange', handleVisibility);
      return () => document.removeEventListener('visibilitychange', handleVisibility);
    }

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        handleAppResume();
      }
    });

    return () => subscription?.remove();
  }, [handleAppResume]);

  useEffect(() => {
    if (!user?.id) return undefined;

    const heartbeat = () => {
      if (Platform.OS === 'web' && typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return;
      }
      refreshSession({ retries: 1, retryDelayMs: 300, minIntervalMs: REFRESH_MIN_INTERVAL_MS });
    };

    const interval = setInterval(heartbeat, SESSION_HEARTBEAT_MS);
    return () => clearInterval(interval);
  }, [refreshSession, user?.id]);

  useEffect(() => {
    if (!isWeb || !user?.id) return undefined;

    const onInteraction = () => {
      const now = Date.now();
      if (now - lastInteractionRefreshRef.current < REFRESH_MIN_INTERVAL_MS) return;
      lastInteractionRefreshRef.current = now;
      recordActivity();
      refreshSession({ retries: 1, retryDelayMs: 300, minIntervalMs: REFRESH_MIN_INTERVAL_MS });
    };

    window.addEventListener('pointerdown', onInteraction, true);
    window.addEventListener('keydown', onInteraction, true);
    window.addEventListener('touchstart', onInteraction, true);
    return () => {
      window.removeEventListener('pointerdown', onInteraction, true);
      window.removeEventListener('keydown', onInteraction, true);
      window.removeEventListener('touchstart', onInteraction, true);
    };
  }, [recordActivity, refreshSession, user?.id]);

  const value = useMemo(() => ({
    user,
    session,
    loading,
    refreshSession,
    logout,
    resetAppData,
  }), [loading, logout, refreshSession, resetAppData, session, user]);

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
