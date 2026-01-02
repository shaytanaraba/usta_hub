import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Load from environment variables
// In Expo, use EXPO_PUBLIC_ prefix for variables accessible in the app
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://hoiodsflirvqgkfcnoxe.supabase.co';
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhvaW9kc2ZsaXJ2cWdrZmNub3hlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcwNzAwODIsImV4cCI6MjA4MjY0NjA4Mn0.SMG6fNHPGtawwxCWi3_iWrc92HGkT4aec9KU_1zuVsw';

// Warn if using fallback values (development only)
if (!process.env.EXPO_PUBLIC_SUPABASE_URL) {
    console.warn('⚠️ EXPO_PUBLIC_SUPABASE_URL not found in environment, using fallback');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
    },
});
