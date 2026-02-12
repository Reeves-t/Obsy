import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef, useState, useCallback } from 'react';
import { View } from 'react-native';
import { ObsyAnimatedSplash } from '@/components/splash/ObsyAnimatedSplash';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { ObsyThemeProvider, useObsyTheme } from '@/contexts/ThemeContext';
import { MockAlbumProvider } from '@/contexts/MockAlbumContext';
import { moodCache } from '@/lib/moodCache';
import { useCaptureStore } from '@/lib/captureStore';
import { useTodayInsight } from '@/lib/todayInsightStore';
import { useWeeklyInsight } from '@/lib/weeklyInsightStore';
import { useMonthlyInsight } from '@/lib/monthlyInsightStore';

const queryClient = new QueryClient();

import {
  Inter_300Light,
  Inter_400Regular,
  Inter_600SemiBold,
  Inter_700Bold
} from '@expo-google-fonts/inter';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  // Ensure that reloading on `/modal` keeps a back button present.
  initialRouteName: '(tabs)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    Inter_300Light,
    Inter_400Regular,
    Inter_600SemiBold,
    Inter_700Bold,
    ...FontAwesome.font,
  });

  const [animationDone, setAnimationDone] = useState(false);
  const [dataReady, setDataReady] = useState(false);
  const isSplashVisible = !animationDone || !dataReady;

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  // Safety timeout: never leave splash stuck for more than 8 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      setAnimationDone(true);
      setDataReady(true);
    }, 8000);
    return () => clearTimeout(timer);
  }, []);

  const handleAnimationComplete = useCallback(() => {
    setAnimationDone(true);
  }, []);

  const handleDataReady = useCallback(() => {
    setDataReady(true);
  }, []);

  if (!loaded) {
    return null;
  }

  return (
    <View style={{ flex: 1 }}>
      <RootLayoutNav onDataReady={handleDataReady} />
      {isSplashVisible && (
        <ObsyAnimatedSplash onAnimationComplete={handleAnimationComplete} />
      )}
    </View>
  );
}

function RootLayoutNav({ onDataReady }: { onDataReady: () => void }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ObsyThemeProvider>
          <MockAlbumProvider>
            <MoodCacheInitializer />
            <SnapshotLoader onDataReady={onDataReady} />
            <ThemedNavigator />
          </MockAlbumProvider>
        </ObsyThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

function MoodCacheInitializer() {
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      moodCache.fetchAllMoods(user.id).catch(err => {
        console.error('[App] Failed to initialize mood cache:', err);
      });
    }
  }, [user]);

  return null;
}

function SnapshotLoader({ onDataReady }: { onDataReady: () => void }) {
  const { user, loading: authLoading } = useAuth();
  const hasFired = useRef(false);

  useEffect(() => {
    if (authLoading || hasFired.current) return;
    hasFired.current = true;

    if (!user) {
      onDataReady();
      return;
    }

    const load = async () => {
      try {
        await useCaptureStore.getState().fetchCaptures(user);

        await Promise.all([
          useTodayInsight.getState().loadSnapshot(user.id),
          useWeeklyInsight.getState().loadSnapshot(user.id),
          useMonthlyInsight.getState().loadSnapshot(user.id),
        ]);
      } catch (err) {
        console.error('[SnapshotLoader] Error during startup load:', err);
      } finally {
        onDataReady();
      }
    };

    load();
  }, [authLoading, user, onDataReady]);

  return null;
}

function ThemedNavigator() {
  const { isDark } = useObsyTheme();

  return (
    <ThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        <Stack.Screen name="auth" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="albums" options={{ headerShown: false }} />
        <Stack.Screen name="invite" options={{ presentation: 'modal', headerShown: false }} />
        <Stack.Screen name="capture" options={{ presentation: 'modal', headerShown: false }} />
        <Stack.Screen name="archive" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
      </Stack>
    </ThemeProvider>
  );
}
