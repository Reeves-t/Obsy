import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

// Use Expo's standard env variable prefix (EXPO_PUBLIC_)
// Ensure these are defined in your .env file
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

type SupportedStorage = {
    getItem: (key: string) => Promise<string | null>;
    setItem: (key: string, value: string) => Promise<void>;
    removeItem: (key: string) => Promise<void>;
};

const memoryStorage = new Map<string, string>();

const webStorage: SupportedStorage = {
    async getItem(key) {
        if (typeof window === 'undefined' || !window.localStorage) {
            return memoryStorage.get(key) ?? null;
        }
        return window.localStorage.getItem(key);
    },
    async setItem(key, value) {
        if (typeof window === 'undefined' || !window.localStorage) {
            memoryStorage.set(key, value);
            return;
        }
        window.localStorage.setItem(key, value);
    },
    async removeItem(key) {
        if (typeof window === 'undefined' || !window.localStorage) {
            memoryStorage.delete(key);
            return;
        }
        window.localStorage.removeItem(key);
    },
};

const storage: SupportedStorage = Platform.OS === 'web' ? webStorage : AsyncStorage;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        storage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false, // Important: turn off for native apps (we use deep links instead)
    },
});

// Helper: Tell Supabase to refresh the session when the app comes back to foreground
// This fixes issues where tokens expire while the app is backgrounded.
if (Platform.OS !== 'web') {
    AppState.addEventListener('change', (state) => {
        if (state === 'active') {
            supabase.auth.startAutoRefresh();
        } else {
            supabase.auth.stopAutoRefresh();
        }
    });
}
