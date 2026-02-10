import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from '../lib/supabase';
import authService from '../services/auth';
import { useToast } from './ToastContext';
import { useLocalization } from './LocalizationContext';

const AuthContext = createContext(null);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const parsePositiveInt = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
};

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
const REFRESH_HARD_TIMEOUT_MS = parsePositiveInt(process?.env?.EXPO_PUBLIC_AUTH_REFRESH_HARD_TIMEOUT_MS, 65000);
const INITIAL_REFRESH_TIMEOUT_MS = parsePositiveInt(
  process?.env?.EXPO_PUBLIC_AUTH_INITIAL_TIMEOUT_MS,
  Math.max(REFRESH_HARD_TIMEOUT_MS + 5000, 70000),
);
const REFRESH_STUCK_TIMEOUT_HITS_LIMIT = parsePositiveInt(process?.env?.EXPO_PUBLIC_AUTH_TIMEOUT_HITS_LIMIT, 3);
const ACTIVITY_WRITE_THROTTLE_MS = Number(process?.env?.EXPO_PUBLIC_ACTIVITY_WRITE_THROTTLE_MS || 45000);
const PROFILE_REVALIDATE_MS = parsePositiveInt(process?.env?.EXPO_PUBLIC_AUTH_PROFILE_REVALIDATE_MS, 10 * 60 * 1000);
// Break session-only deadlocks when profile resolution repeatedly fails.
const PROFILE_RESOLUTION_MISS_LIMIT = 3;
const AUTH_DIAG_ENABLED = process?.env?.EXPO_PUBLIC_ENABLE_AUTH_DIAGNOSTICS === '1';
const WEB_SESSION_MODE = process?.env?.EXPO_PUBLIC_WEB_SESSION_MODE === 'tab' ? 'tab' : 'persistent';
const authDiag = (...args) => {
  if (AUTH_DIAG_ENABLED) {
    console.log('[Auth][Diag]', ...args);
  }
};
const authDiagTimerStart = () => Date.now();
const authDiagTimerEnd = (startAt) => Date.now() - startAt;

const isWeb = Platform.OS === 'web'
  && typeof window !== 'undefined'
  && (typeof window.localStorage !== 'undefined' || typeof window.sessionStorage !== 'undefined');
const memoryStorage = new Map();
const getWebStorageCandidates = () => {
  if (typeof window === 'undefined') return [];
  const local = typeof window.localStorage !== 'undefined' ? window.localStorage : null;
  const session = typeof window.sessionStorage !== 'undefined' ? window.sessionStorage : null;
  if (WEB_SESSION_MODE === 'tab') {
    return [session, local].filter(Boolean);
  }
  return [local, session].filter(Boolean);
};
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
    const storages = getWebStorageCandidates();
    storages.forEach((storage) => {
      for (let i = 0; i < storage.length; i += 1) {
        const key = storage.key(i);
        if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
          storage.removeItem(key);
        }
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
      const storages = getWebStorageCandidates();
      for (const storage of storages) {
        const value = storage.getItem(key);
        if (value !== null && value !== undefined) return value;
      }
      return null;
    } catch (error) {
      console.warn('[Auth] webStorage.getItem failed, using memory store', error);
      return memoryStorage.has(key) ? memoryStorage.get(key) : null;
    }
  },
  setItem: async (key, value) => {
    if (!isWeb) return AsyncStorage.setItem(key, value);
    try {
      const storages = getWebStorageCandidates();
      if (!storages.length) throw new Error('No web storage available');
      storages[0].setItem(key, value);
    } catch (error) {
      console.warn('[Auth] webStorage.setItem failed, using memory store', error);
      memoryStorage.set(key, value);
    }
  },
  removeItem: async (key) => {
    if (!isWeb) return AsyncStorage.removeItem(key);
    try {
      const storages = getWebStorageCandidates();
      storages.forEach((storage) => storage.removeItem(key));
    } catch (error) {
      console.warn('[Auth] webStorage.removeItem failed, using memory store', error);
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
  const profileMissStreakRef = useRef(0);
  const refreshInFlight = useRef(null);
  const refreshVersionRef = useRef(0);
  const resumeRefreshInFlightRef = useRef(false);
  const lastRefreshRef = useRef(0);
  const lastProfileSyncAtRef = useRef(0);
  const refreshTimeoutHitsRef = useRef({ promise: null, hits: 0 });
  const lastActivityRef = useRef(Date.now());
  const lastInteractionRefreshRef = useRef(0);
  const lastAuthIssueToastRef = useRef({ key: '', at: 0 });

  useEffect(() => {
    latestUserRef.current = user;
  }, [user]);

  useEffect(() => {
    if (user?.id) {
      lastProfileSyncAtRef.current = Date.now();
      return;
    }
    lastProfileSyncAtRef.current = 0;
  }, [user?.id]);

  useEffect(() => {
    authDiag('provider_initialized', {
      webSessionMode: WEB_SESSION_MODE,
      activityWriteThrottleMs: ACTIVITY_WRITE_THROTTLE_MS,
      refreshHardTimeoutMs: REFRESH_HARD_TIMEOUT_MS,
      initialRefreshTimeoutMs: INITIAL_REFRESH_TIMEOUT_MS,
      refreshStuckTimeoutHitsLimit: REFRESH_STUCK_TIMEOUT_HITS_LIMIT,
      profileRevalidateMs: PROFILE_REVALIDATE_MS,
    });
  }, []);

  useEffect(() => {
    if (!AUTH_DIAG_ENABLED) return;
    let cancelled = false;
    const runStorageSelfTest = async () => {
      const key = '__auth_activity_storage_self_test__';
      try {
        await activityStorage.setItem(key, 'ok');
        const value = await activityStorage.getItem(key);
        await activityStorage.removeItem(key);
        if (cancelled) return;
        if (value === 'ok') {
          console.log('[Auth][Diag] activity_storage_self_test_pass');
          return;
        }
        console.error('[Auth][Diag] activity_storage_self_test_fail', { value });
      } catch (error) {
        if (cancelled) return;
        console.error('[Auth][Diag] activity_storage_self_test_error', error);
      }
    };
    runStorageSelfTest();
    return () => {
      cancelled = true;
    };
  }, []);

  const clearPersistedSessionArtifacts = useCallback(async () => {
    try {
      await activityStorage.removeItem(LAST_ACTIVE_KEY);
    } catch (error) {
      console.warn('[Auth] Failed clearing last activity key', error);
    }
    await clearSupabaseWebStorage();
    await clearSupabaseNativeStorage();
  }, []);

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
    if (refreshInFlight.current && latestUserRef.current?.id && options.waitForInFlight !== true) {
      authDiag('refresh_session_return_cached_while_inflight', {
        refreshVersion: refreshVersionRef.current,
      });
      return latestUserRef.current;
    }
    if (!refreshInFlight.current) {
      const now = Date.now();
      if (minIntervalMs > 0 && now - lastRefreshRef.current < minIntervalMs) {
        return latestUserRef.current;
      }

      const refreshVersion = refreshVersionRef.current + 1;
      refreshVersionRef.current = refreshVersion;

      const refreshPromise = (async () => {
        const isStaleRefresh = () => refreshVersion !== refreshVersionRef.current;
        const refreshStartedAt = authDiagTimerStart();
        authDiag('refresh_session_start', { refreshVersion, minIntervalMs, retries: options?.retries });
        try {
          lastRefreshRef.current = Date.now();
          const sessionStepAt = authDiagTimerStart();
          const { data: { session: activeSession }, error: sessionError } = await supabase.auth.getSession();
          authDiag('refresh_session_step_done', {
            refreshVersion,
            step: 'getSession',
            ms: authDiagTimerEnd(sessionStepAt),
            hasSession: !!activeSession?.user,
            hasError: !!sessionError,
          });
          if (isStaleRefresh()) {
            authDiag('refresh_session_exit_stale', { refreshVersion, step: 'after_getSession' });
            return latestUserRef.current || null;
          }
          if (sessionError) {
            if (isAuthInvalidError(sessionError)) {
              notifyAuthIssue('session_expired');
              try { await supabase.auth.signOut({ scope: 'local' }); } catch (e) {}
              await clearPersistedSessionArtifacts();
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
            profileMissStreakRef.current = 0;
            if (!isStaleRefresh()) {
              setUser(null);
            }
            return null;
          }

          const cachedUser = latestUserRef.current;
          const sameUser = !!cachedUser?.id && String(cachedUser.id) === String(activeSession.user.id);
          const forceProfile = options.forceProfile === true;
          const profileRevalidateMs = Number.isInteger(options.profileRevalidateMs)
            ? options.profileRevalidateMs
            : PROFILE_REVALIDATE_MS;
          const profileAgeMs = Date.now() - (lastProfileSyncAtRef.current || 0);
          const isDispatcherUser = String(cachedUser?.role || '').toLowerCase() === 'dispatcher';
          if (sameUser && !forceProfile && !isDispatcherUser && profileAgeMs < profileRevalidateMs) {
            authDiag('refresh_session_cached_user_hit', {
              refreshVersion,
              profileAgeMs,
              profileRevalidateMs,
            });
            return cachedUser;
          }

          const retries = Number.isInteger(options.retries) ? options.retries : 0;
          const retryDelayMs = Number.isInteger(options.retryDelayMs) ? options.retryDelayMs : 350;
          let attempt = 0;
          let currentUser = null;
          while (attempt <= retries) {
            const profileStepAt = authDiagTimerStart();
            currentUser = await authService.getCurrentUser({ session: activeSession });
            authDiag('refresh_session_step_done', {
              refreshVersion,
              step: 'getCurrentUser',
              attempt,
              ms: authDiagTimerEnd(profileStepAt),
              hasUser: !!currentUser?.id,
            });
            if (currentUser || isStaleRefresh()) break;
            attempt += 1;
            if (attempt <= retries) {
              await sleep(retryDelayMs);
            }
          }

          if (isStaleRefresh()) {
            authDiag('refresh_session_exit_stale', { refreshVersion, step: 'after_getCurrentUser' });
            return latestUserRef.current || null;
          }

          if (currentUser) {
            profileMissStreakRef.current = 0;
            setUser(currentUser);
            lastProfileSyncAtRef.current = Date.now();
            authDiag('refresh_session_success', {
              refreshVersion,
              ms: authDiagTimerEnd(refreshStartedAt),
              source: 'profile',
            });
            return currentUser;
          }

          // Keep existing user on transient failures to avoid random logouts.
          if (latestUserRef.current) return latestUserRef.current;

          let shouldClearSession = false;
          let userCheckIssue = null;
          let hasAuthenticatedUser = false;
          try {
            const userCheckStepAt = authDiagTimerStart();
            const { data: userData, error: userError } = await supabase.auth.getUser();
            authDiag('refresh_session_step_done', {
              refreshVersion,
              step: 'getUser_fallback',
              ms: authDiagTimerEnd(userCheckStepAt),
              hasUser: !!userData?.user?.id,
              hasError: !!userError,
            });
            if (isStaleRefresh()) {
              authDiag('refresh_session_exit_stale', { refreshVersion, step: 'after_getUser_fallback' });
              return latestUserRef.current || null;
            }
            hasAuthenticatedUser = !!userData?.user?.id;
            if (userError) {
              userCheckIssue = toAuthIssueKey(userError);
              if (isAuthInvalidError(userError)) {
                shouldClearSession = true;
              } else if (!isTransientError(userError)) {
                shouldClearSession = true;
              }
            } else if (!userData?.user?.id) {
              shouldClearSession = true;
            }
          } catch (userCheckError) {
            if (isStaleRefresh()) {
              return latestUserRef.current || null;
            }
            userCheckIssue = toAuthIssueKey(userCheckError);
            if (!isTransientError(userCheckError)) {
              shouldClearSession = true;
            }
          }

          if (!shouldClearSession && hasAuthenticatedUser) {
            profileMissStreakRef.current += 1;
            authDiag('profile_miss_streak_increment', { streak: profileMissStreakRef.current });
            if (profileMissStreakRef.current >= PROFILE_RESOLUTION_MISS_LIMIT) {
              shouldClearSession = true;
              userCheckIssue = userCheckIssue || 'session_expired';
              console.warn('[Auth] Profile resolution miss limit reached; clearing session to break bootstrap deadlock', {
                streak: profileMissStreakRef.current,
              });
            }
          } else {
            profileMissStreakRef.current = 0;
          }

          if (shouldClearSession) {
            if (userCheckIssue === 'session_expired') {
              notifyAuthIssue('session_expired');
            }
            try { await supabase.auth.signOut({ scope: 'local' }); } catch (e) {}
            await clearPersistedSessionArtifacts();
            if (!isStaleRefresh()) {
              setSession(null);
            }
            lastProfileSyncAtRef.current = 0;
            profileMissStreakRef.current = 0;
          } else if (userCheckIssue) {
            notifyAuthIssue(userCheckIssue);
          }

          setUser(null);
          authDiag('refresh_session_done_no_user', {
            refreshVersion,
            ms: authDiagTimerEnd(refreshStartedAt),
            shouldClearSession,
            userCheckIssue,
          });
          return null;
        } catch (error) {
          if (isStaleRefresh()) {
            authDiag('refresh_session_exit_stale', { refreshVersion, step: 'catch' });
            return latestUserRef.current || null;
          }
          console.error('[Auth] refreshSession failed', error);
          if (isAuthInvalidError(error)) {
            profileMissStreakRef.current = 0;
            notifyAuthIssue('session_expired');
            try { await supabase.auth.signOut({ scope: 'local' }); } catch (e) {}
            await clearPersistedSessionArtifacts();
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
          profileMissStreakRef.current = 0;
          authDiag('refresh_session_failed_hard', {
            refreshVersion,
            ms: authDiagTimerEnd(refreshStartedAt),
            message: error?.message || String(error),
          });
          return null;
        }
      })();

      refreshInFlight.current = refreshPromise;
      refreshTimeoutHitsRef.current = { promise: refreshPromise, hits: 0 };
      refreshPromise.finally(() => {
        if (refreshTimeoutHitsRef.current?.promise === refreshPromise) {
          refreshTimeoutHitsRef.current = { promise: null, hits: 0 };
        }
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
      const timeoutHits = refreshTimeoutHitsRef.current?.promise === activeRefreshPromise
        ? (refreshTimeoutHitsRef.current.hits + 1)
        : 1;
      refreshTimeoutHitsRef.current = { promise: activeRefreshPromise, hits: timeoutHits };
      const hasCachedUser = !!latestUserRef.current?.id;
      console.warn('[Auth] refreshSession timed out', {
        timeoutHits,
        hardTimeoutMs: REFRESH_HARD_TIMEOUT_MS,
        hasCachedUser,
      });
      authDiag('refresh_session_timeout', {
        refreshVersion: refreshVersionRef.current,
        hardTimeoutMs: REFRESH_HARD_TIMEOUT_MS,
        timeoutHits,
        hasCachedUser,
      });
      if (!hasCachedUser) {
        notifyAuthIssue('timeout');
      }
      if (timeoutHits >= REFRESH_STUCK_TIMEOUT_HITS_LIMIT && refreshInFlight.current === activeRefreshPromise) {
        authDiag('refresh_session_timeout_force_reset', {
          refreshVersion: refreshVersionRef.current,
          timeoutHits,
          hardTimeoutMs: REFRESH_HARD_TIMEOUT_MS,
        });
        refreshVersionRef.current += 1;
        refreshInFlight.current = null;
        refreshTimeoutHitsRef.current = { promise: null, hits: 0 };
      }
      return latestUserRef.current || null;
    }
    return result;
  }, [clearPersistedSessionArtifacts, notifyAuthIssue]);

  const logout = useCallback(async (options = {}) => {
    refreshVersionRef.current += 1;
    refreshInFlight.current = null;
    profileMissStreakRef.current = 0;
    const result = await authService.logoutUser(options);
    setSession(null);
    setUser(null);
    await clearPersistedSessionArtifacts();
    return result;
  }, [clearPersistedSessionArtifacts]);

  const resetAppData = useCallback(async () => {
    await logout({ scope: 'local' });
    await clearSupabaseWebStorage();
    await clearSupabaseNativeStorage();
  }, [logout]);

  const recordActivity = useCallback(async (options = {}) => {
    const now = Date.now();
    lastActivityRef.current = now;
    const force = options.force === true;
    if (!force && now - lastInteractionRefreshRef.current < ACTIVITY_WRITE_THROTTLE_MS) {
      return;
    }
    lastInteractionRefreshRef.current = now;
    try {
      await activityStorage.setItem(LAST_ACTIVE_KEY, String(now));
      authDiag('activity_written', { force, at: now });
    } catch (error) {
      console.warn('[Auth] recordActivity failed', error);
    }
  }, []);

  const checkInactivity = useCallback(async () => {
    try {
      const stored = await activityStorage.getItem(LAST_ACTIVE_KEY);
      if (!stored) {
        await recordActivity({ force: true });
        return false;
      }
      const lastActiveAt = Number(stored);
      if (!Number.isFinite(lastActiveAt)) {
        await recordActivity({ force: true });
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
      await recordActivity({ force: true });
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
      authDiag('auth_state_change', { event, hasSession: !!nextSession?.user });
      setSession(nextSession || null);
      if (event === 'SIGNED_OUT') {
        refreshVersionRef.current += 1;
        refreshInFlight.current = null;
        refreshTimeoutHitsRef.current = { promise: null, hits: 0 };
        lastProfileSyncAtRef.current = 0;
        profileMissStreakRef.current = 0;
        setUser(null);
        await clearPersistedSessionArtifacts();
        return;
      }
      if (!nextSession?.user) return;

      if (event === 'TOKEN_REFRESHED') {
        await recordActivity({ force: false });
        // Avoid profile fetch churn on every token refresh; bootstrap path still resolves profile if needed.
        if (!latestUserRef.current?.id) {
          await refreshSession({ retries: 0, retryDelayMs: 300, minIntervalMs: 0, forceProfile: true });
        }
        return;
      }

      if (event === 'SIGNED_IN'
        && latestUserRef.current?.id
        && String(latestUserRef.current.id) === String(nextSession.user.id)) {
        await recordActivity({ force: false });
        return;
      }

      await recordActivity({ force: true });
      await refreshSession({ retries: 0, retryDelayMs: 300, minIntervalMs: REFRESH_MIN_INTERVAL_MS });
    });

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, [checkInactivity, clearPersistedSessionArtifacts, notifyAuthIssue, recordActivity, refreshSession]);

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
    if (!isWeb || !user?.id || typeof window === 'undefined') return undefined;

    const markInteraction = () => {
      void recordActivity({ force: false });
    };

    window.addEventListener('pointerdown', markInteraction, true);
    window.addEventListener('keydown', markInteraction, true);
    window.addEventListener('touchstart', markInteraction, true);
    window.addEventListener('focus', markInteraction, true);

    return () => {
      window.removeEventListener('pointerdown', markInteraction, true);
      window.removeEventListener('keydown', markInteraction, true);
      window.removeEventListener('touchstart', markInteraction, true);
      window.removeEventListener('focus', markInteraction, true);
    };
  }, [recordActivity, user?.id]);

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
