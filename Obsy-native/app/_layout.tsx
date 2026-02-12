import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import Animated, { FadeOut } from 'react-native-reanimated';
import { View, StyleSheet } from 'react-native';
import { ObsyAnimatedSplash } from '@/components/splash/ObsyAnimatedSplash';

import { useColorScheme } from '@/components/useColorScheme';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { ObsyThemeProvider, useObsyTheme } from '@/contexts/ThemeContext';
import { MockAlbumProvider } from '@/contexts/MockAlbumContext';
import { moodCache } from '@/lib/moodCache';
import { NotificationLifecycle } from '@/lib/notifications/NotificationLifecycle';

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

  const [isSplashVisible, setIsSplashVisible] = useState(true);

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
      // Animation handling is now done inside ObsyAnimatedSplash
      // We just need to wait for it to signal completion
    }
  }, [loaded]);

  const handleAnimationComplete = () => {
    setIsSplashVisible(false);
  };

  if (!loaded) {
    return null; // Native splash handles this
  }

  return (
    <View style={{ flex: 1 }}>
      <RootLayoutNav />
      {isSplashVisible && (
        <ObsyAnimatedSplash onAnimationComplete={handleAnimationComplete} />
      )}
    </View>
  );
}

function RootLayoutNav() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ObsyThemeProvider>
          <MockAlbumProvider>
            <MoodCacheInitializer />
            <NotificationLifecycle />
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
