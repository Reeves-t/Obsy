import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { useRouter, useSegments } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { initializeMoodStore } from '@/lib/customMoodStore';
import { moodCache } from '@/lib/moodCache';

type AuthContextType = {
    session: Session | null;
    user: User | null;
    loading: boolean;
    isGuest: boolean;
    signIn: (email: string, password: string) => Promise<{ error: any }>;
    signUp: (email: string, password: string, fullName?: string) => Promise<{ error: any; user?: User | null }>;
    signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
    session: null,
    user: null,
    loading: true,
    isGuest: true,
    signIn: async () => ({ error: null }),
    signUp: async () => ({ error: null }),
    signOut: async () => { },
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);
    const router = useRouter();
    const segments = useSegments();

    // Derived state: user is a guest if there's no session
    const isGuest = !session;

    useEffect(() => {
        // 1. Fetch initial session
        const fetchSession = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            setSession(session);
            setLoading(false);

            // Initialize mood store with user ID or null for guests
            initializeMoodStore(session?.user?.id ?? null);

            // Initialize mood cache for reliable mood resolution
            moodCache.fetchAllMoods(session?.user?.id ?? null);
        };

        fetchSession();

        // 2. Listen for auth changes (login, logout, refresh)
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            (_event, session) => {
                setSession(session);
                setLoading(false);

                // Re-initialize mood store when auth state changes
                initializeMoodStore(session?.user?.id ?? null);

                // Re-initialize mood cache when auth state changes
                moodCache.fetchAllMoods(session?.user?.id ?? null);
            }
        );

        return () => subscription.unsubscribe();
    }, []);

    // 3. Navigation Guard - GUEST FIRST APPROACH
    // Only redirect authenticated users away from auth screens
    // Guests can access the main app freely
    useEffect(() => {
        if (loading) return;

        const inAuthGroup = segments[0] === 'auth';

        // Only redirect: If user IS logged in but on auth screens -> go to main app
        if (session && inAuthGroup) {
            router.replace('/(tabs)');
        }
        // REMOVED: No longer force guests to login screen
    }, [session, loading, segments]);

    const signIn = async (email: string, password: string) => {
        const { error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });
        return { error };
    };

    const signUp = async (email: string, password: string, fullName?: string) => {
        // Sign up with user metadata containing full_name
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    full_name: fullName || '',
                },
            },
        });

        if (error) {
            return { error, user: null };
        }

        // The trigger will auto-create the profile row.
        // But we also update it here to ensure full_name is set correctly.
        if (data.user && fullName) {
            await supabase
                .from('profiles')
                .upsert({
                    id: data.user.id,
                    full_name: fullName,
                });
        }

        return { error: null, user: data.user };
    };

    const signOut = async () => {
        await supabase.auth.signOut();
        setSession(null);
        // After sign out, user becomes a guest but stays in the app
    };

    // Show a splash screen while checking initial auth status
    if (loading) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' }}>
                <ActivityIndicator size="large" color="#fff" />
            </View>
        );
    }

    return (
        <AuthContext.Provider
            value={{
                session,
                user: session?.user ?? null,
                loading,
                isGuest,
                signIn,
                signUp,
                signOut,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}
