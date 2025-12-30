import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

// TODO: Replace with your actual Supabase URL and Anon Key
const SUPABASE_URL = 'https://hoiodsflirvqgkfcnoxe.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhvaW9kc2ZsaXJ2cWdrZmNub3hlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcwNzAwODIsImV4cCI6MjA4MjY0NjA4Mn0.SMG6fNHPGtawwxCWi3_iWrc92HGkT4aec9KU_1zuVsw';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
    },
});
