import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef, useState, useCallback } from 'react';
import { View } from 'react-native';
import { ShareIntentProvider, useShareIntentContext } from 'expo-share-intent';
import { extractUrlFromSharePayload, isValidShareUrl } from '@/services/sharedLinkService';
import { ObsyAnimatedSplash } from '@/components/splash/ObsyAnimatedSplash';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { ObsyThemeProvider, useObsyTheme } from '@/contexts/ThemeContext';
import { I18nProvider } from '@/i18n/config';
import { moodCache } from '@/lib/moodCache';
import { configureRevenueCat, identifyRevenueCatUser, resetRevenueCatUser } from '@/lib/revenuecat';
import { initAnalytics, identifyUser, resetAnalytics } from '@/lib/analytics';
import { useCaptureStore } from '@/lib/captureStore';
import { useTodayInsight } from '@/lib/todayInsightStore';
import { useWeeklyInsight } from '@/lib/weeklyInsightStore';
import { useMonthlyInsight } from '@/lib/monthlyInsightStore';
import { useYearInPixelsStore } from '@/lib/yearInPixelsStore';

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
    // ShareIntentProvider must wrap every other provider — it is what picks up
    // the payload when the OS launches the app from a share sheet.
    <ShareIntentProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <I18nProvider>
            <ObsyThemeProvider>
              <MoodCacheInitializer />
              <RevenueCatInitializer />
              <AnalyticsInitializer />
              <ShareIntentRouter />
              <SnapshotLoader onDataReady={onDataReady} />
              <ThemedNavigator />
            </ObsyThemeProvider>
          </I18nProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ShareIntentProvider>
  );
}

/**
 * Routes an incoming OS share into the QuickSave sheet.
 *
 * Share payloads are rarely a bare URL — apps commonly send "Title -
 * https://…", so the raw text is scanned for a link when `webUrl` is absent.
 * The intent is reset as soon as it has been routed, otherwise it replays on
 * the next foreground.
 */
function ShareIntentRouter() {
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();
  const router = useRouter();

  useEffect(() => {
    if (!hasShareIntent) return;

    const candidate = shareIntent?.webUrl
      ?? extractUrlFromSharePayload(shareIntent?.text ?? '');

    if (candidate && isValidShareUrl(candidate)) {
      router.push({
        pathname: '/share',
        params: {
          url: candidate,
          // iOS supplies the page title when web-page activation is enabled;
          // it beats anything we could guess from the URL slug.
          title: shareIntent?.meta?.title ?? '',
        },
      });
    }

    resetShareIntent();
  }, [hasShareIntent, shareIntent, router, resetShareIntent]);

  return null;
}

function RevenueCatInitializer() {
  const { user } = useAuth();

  useEffect(() => {
    configureRevenueCat();
  }, []);

  useEffect(() => {
    if (user) {
      identifyRevenueCatUser(user.id);
    } else {
      resetRevenueCatUser();
    }
  }, [user]);

  return null;
}

function AnalyticsInitializer() {
  const { user } = useAuth();

  useEffect(() => {
    initAnalytics();
  }, []);

  useEffect(() => {
    if (user) {
      identifyUser(user.id);
    } else {
      resetAnalytics();
    }
  }, [user]);

  return null;
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
          useYearInPixelsStore.getState().loadFromSupabase(user),
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
        <Stack.Screen name="friends" options={{ headerShown: false }} />
        <Stack.Screen name="invite" options={{ presentation: 'modal', headerShown: false }} />
        <Stack.Screen name="capture" options={{ presentation: 'modal', headerShown: false }} />
        <Stack.Screen name="journal" options={{ presentation: 'modal', headerShown: false }} />
        <Stack.Screen name="voice" options={{ presentation: 'modal', headerShown: false }} />
        <Stack.Screen name="quick-mood" options={{ presentation: 'modal', headerShown: false }} />
        <Stack.Screen name="share" options={{ presentation: 'modal', headerShown: false }} />
        <Stack.Screen name="reflect" options={{ presentation: 'modal', headerShown: false }} />
        <Stack.Screen name="topics" options={{ headerShown: false }} />
        <Stack.Screen name="archive" options={{ headerShown: false }} />
        <Stack.Screen name="language" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
      </Stack>
    </ThemeProvider>
  );
}
