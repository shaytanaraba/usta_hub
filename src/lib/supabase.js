import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const isDebug = typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV !== 'production';
const debug = (...args) => {
    if (isDebug) console.log(...args);
};
const debugWarn = (...args) => {
    if (isDebug) console.warn(...args);
};
// Load from environment variables
// In Expo, use EXPO_PUBLIC_ prefix for variables accessible in the app
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://dpwdyvahtkvwvfpmhkhx.supabase.co';
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRwd2R5dmFodGt2d3ZmcG1oa2h4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzY1NjEyMDQsImV4cCI6MjA1MjEzNzIwNH0.dNpvPQxCFzXhFqX-msHG2IIpSxRvRTOjTCAbTTe21J4';

// Warn if using fallback values (development only)
if (!process.env.EXPO_PUBLIC_SUPABASE_URL) {
        debugWarn('[Supabase] EXPO_PUBLIC_SUPABASE_URL not found in environment, using fallback');
}

// Detect if running on web more reliably
const isWeb = Platform.OS === 'web' || (typeof window !== 'undefined' && typeof localStorage !== 'undefined');
debug('[Supabase] Platform:', Platform.OS, 'isWeb:', isWeb);

// Create a localStorage wrapper that matches Supabase's expected interface
const webStorage = {
    getItem: async (key) => {
        try {
            const value = localStorage.getItem(key);
            debug('[Supabase] webStorage.getItem:', key, value ? 'found' : 'null');
            return value;
        } catch (e) {
            console.error('[Supabase] webStorage.getItem error:', e);
            return null;
        }
    },
    setItem: async (key, value) => {
        try {
            localStorage.setItem(key, value);
            debug('[Supabase] webStorage.setItem:', key);
        } catch (e) {
            console.error('[Supabase] webStorage.setItem error:', e);
        }
    },
    removeItem: async (key) => {
        try {
            localStorage.removeItem(key);
            debug('[Supabase] webStorage.removeItem:', key);
        } catch (e) {
            console.error('[Supabase] webStorage.removeItem error:', e);
        }
    },
};

// Use appropriate storage based on platform
const storage = isWeb ? webStorage : AsyncStorage;
debug('[Supabase] Using storage:', isWeb ? 'localStorage (web)' : 'AsyncStorage (native)');

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        storage: storage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: isWeb, // Enable for web OAuth flows
    },
});
