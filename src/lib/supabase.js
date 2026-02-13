import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const isDebug = process?.env?.EXPO_PUBLIC_ENABLE_SUPABASE_LOGS === '1';
const REQUEST_TIMEOUT_MS = Number(process?.env?.EXPO_PUBLIC_SUPABASE_TIMEOUT_MS || 12000);
const WEB_SESSION_MODE = process?.env?.EXPO_PUBLIC_WEB_SESSION_MODE === 'tab' ? 'tab' : 'persistent';
const AUTH_SESSION_POLICY = process?.env?.EXPO_PUBLIC_AUTH_SESSION_POLICY === 'single' ? 'single' : 'multi';
const authDiagEnabled = process?.env?.EXPO_PUBLIC_ENABLE_AUTH_DIAGNOSTICS === '1';
const debug = (...args) => {
    if (isDebug) console.log(...args);
};
const debugWarn = (...args) => {
    if (isDebug) console.warn(...args);
};
const authDiag = (...args) => {
    if (authDiagEnabled) console.log('[Supabase][AuthPolicy]', ...args);
};
// Load from environment variables
// In Expo, use EXPO_PUBLIC_ prefix for variables accessible in the app
const ENV_SUPABASE_URL = String(process.env.EXPO_PUBLIC_SUPABASE_URL || '').trim();
const ENV_SUPABASE_ANON_KEY = String(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '').trim();
const missingSupabaseEnv = [];
if (!ENV_SUPABASE_URL) missingSupabaseEnv.push('EXPO_PUBLIC_SUPABASE_URL');
if (!ENV_SUPABASE_ANON_KEY) missingSupabaseEnv.push('EXPO_PUBLIC_SUPABASE_ANON_KEY');
if (missingSupabaseEnv.length) {
    const missingMessage = `[Supabase] Missing required environment variable(s): ${missingSupabaseEnv.join(', ')}`;
    console.error(missingMessage);
    throw new Error(missingMessage);
}
export const SUPABASE_URL = ENV_SUPABASE_URL;
export const SUPABASE_ANON_KEY = ENV_SUPABASE_ANON_KEY;

// Detect if running on web more reliably
const isWeb = Platform.OS === 'web'
    || (typeof window !== 'undefined'
        && (typeof window.localStorage !== 'undefined' || typeof window.sessionStorage !== 'undefined'));
debug('[Supabase] Platform:', Platform.OS, 'isWeb:', isWeb);

const memoryStorage = new Map();
const getBrowserStorage = () => {
    if (typeof window === 'undefined') {
        return { storage: null, label: 'none' };
    }
    if (WEB_SESSION_MODE === 'tab' && typeof window.sessionStorage !== 'undefined') {
        return { storage: window.sessionStorage, label: 'sessionStorage' };
    }
    if (typeof window.localStorage !== 'undefined') {
        return { storage: window.localStorage, label: 'localStorage' };
    }
    if (typeof window.sessionStorage !== 'undefined') {
        return { storage: window.sessionStorage, label: 'sessionStorage(fallback)' };
    }
    return { storage: null, label: 'none' };
};

const createWebStorage = () => {
    let webStorageHealthy = true;
    const browserStorageRef = getBrowserStorage();
    const browserStorage = browserStorageRef.storage;
    const browserStorageLabel = browserStorageRef.label;

    const getFromMemory = (key) => (memoryStorage.has(key) ? memoryStorage.get(key) : null);

    const markUnhealthy = (error) => {
        if (!webStorageHealthy) return;
        webStorageHealthy = false;
        debugWarn('[Supabase] localStorage unavailable, falling back to memory store', error);
    };

    try {
        if (!browserStorage) {
            webStorageHealthy = false;
        } else {
            const testKey = '__supabase_storage_test__';
            browserStorage.setItem(testKey, '1');
            browserStorage.removeItem(testKey);
        }
    } catch (e) {
        markUnhealthy(e);
    }

    authDiag('initialized', {
        webSessionMode: WEB_SESSION_MODE,
        authSessionPolicy: AUTH_SESSION_POLICY,
        browserStorage: browserStorageLabel,
        webStorageHealthy,
    });

    return {
        getItem: async (key) => {
            if (!webStorageHealthy) return getFromMemory(key);
            try {
                const value = browserStorage.getItem(key);
                debug('[Supabase] webStorage.getItem:', key, value ? 'found' : 'null');
                return value;
            } catch (e) {
                markUnhealthy(e);
                return getFromMemory(key);
            }
        },
        setItem: async (key, value) => {
            if (!webStorageHealthy) {
                memoryStorage.set(key, value);
                return;
            }
            try {
                browserStorage.setItem(key, value);
                debug('[Supabase] webStorage.setItem:', key);
            } catch (e) {
                markUnhealthy(e);
                memoryStorage.set(key, value);
            }
        },
        removeItem: async (key) => {
            if (!webStorageHealthy) {
                memoryStorage.delete(key);
                return;
            }
            try {
                browserStorage.removeItem(key);
                debug('[Supabase] webStorage.removeItem:', key);
            } catch (e) {
                markUnhealthy(e);
                memoryStorage.delete(key);
            }
        },
    };
};

// Use appropriate storage based on platform
const storage = isWeb ? createWebStorage() : AsyncStorage;
debug('[Supabase] Using storage:', isWeb ? `web storage (${WEB_SESSION_MODE})` : 'AsyncStorage (native)');

const timedFetch = async (resource, options = {}) => {
    // Supabase queries can occasionally hang after long idle/sleep cycles.
    // Enforce a timeout so UI actions fail fast and recover.
    if (typeof fetch !== 'function') {
        throw new Error('Global fetch is not available');
    }

    if (REQUEST_TIMEOUT_MS <= 0) {
        return fetch(resource, options);
    }

    const controller = new AbortController();
    let didTimeout = false;
    let externalAbortHandler = null;
    if (options?.signal) {
        if (options.signal.aborted) {
            controller.abort(options.signal.reason);
        } else {
            externalAbortHandler = () => controller.abort(options.signal.reason);
            options.signal.addEventListener('abort', externalAbortHandler, { once: true });
        }
    }
    const timer = setTimeout(() => {
        didTimeout = true;
        controller.abort();
    }, REQUEST_TIMEOUT_MS);
    try {
        return await fetch(resource, { ...options, signal: controller.signal });
    } catch (error) {
        if (didTimeout || error?.code === 'SUPABASE_TIMEOUT') {
            const timeoutError = new Error('Request timed out. Please check your connection and try again.');
            timeoutError.name = 'SupabaseTimeoutError';
            timeoutError.code = 'SUPABASE_TIMEOUT';
            throw timeoutError;
        }
        throw error;
    } finally {
        clearTimeout(timer);
        if (externalAbortHandler && options?.signal) {
            options.signal.removeEventListener('abort', externalAbortHandler);
        }
    }
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        storage: storage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: isWeb, // Enable for web OAuth flows
    },
    global: {
        fetch: timedFetch,
    },
});
