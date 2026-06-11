import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { StyleSheet, View, ScrollView, Dimensions, NativeSyntheticEvent, NativeScrollEvent, AppState, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { ThemedText } from '@/components/ui/ThemedText';
import { YearInPixelsSection } from '@/components/home/YearInPixelsSection';
import { DailyMonthlyPixelsSection } from '@/components/home/DailyMonthlyPixelsSection';
import { HomeActionCarousel } from '@/components/home/HomeActionCarousel';
import { ThemeDots } from '@/components/home/ThemeDots';
import { useCaptureStore } from '@/lib/captureStore';
import { useTimeFormatStore, getFormattedTime } from '@/lib/timeFormatStore';
import { useAuth } from '@/contexts/AuthContext';
import { useObsyTheme } from '@/contexts/ThemeContext';
import { format } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';
import { isDevUser } from '@/lib/devConfig';
import { DevPortalModal } from '@/components/dev/DevPortalModal';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AmbientMoodField } from '@/components/ambient/AmbientMoodField';
import { useWeeklyMoodAggregation } from '@/hooks/useWeeklyMoodAggregation';
import { useAmbientMoodFieldStore } from '@/lib/ambientMoodFieldStore';
import { useHorizonStarsStore } from '@/lib/horizonStarsStore';
import { useFocusEffect } from '@react-navigation/native';
import { SaveCaptureAnimation } from '@/components/capture/SaveCaptureAnimation';
import { DEFAULT_TAB_BAR_HEIGHT } from '@/components/ScreenWrapper';
import Animated, { FadeIn } from 'react-native-reanimated';

const { height, width } = Dimensions.get('window');
const SHOW_YEAR_IN_PIXELS_MVP = false;
const SHOW_MONTHLY_PIXEL_VIEWER_MVP = false;

let hasForcedOnboardingThisSession = false;

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const router = useRouter();
  const {
    captures,
    loading,
    fetchCaptures,
    pendingSaveAnimationUri,
    setPendingSaveAnimationUri,
    pendingSaveMoodGradient,
    setPendingSaveMoodGradient,
    pendingSaveComplete,
    setPendingSaveComplete,
  } = useCaptureStore();
  const { timeFormat } = useTimeFormatStore();
  const { colors, usesTimeTheme, activeGradient } = useObsyTheme();
  const pageHeight = Math.max(height - insets.top - insets.bottom, 1);
  const headerTop = Math.max(insets.top, 32) + 48;

  const [currentTime, setCurrentTime] = useState(new Date());
  const [devPortalVisible, setDevPortalVisible] = useState(false);
  const [hasFetchedCaptures, setHasFetchedCaptures] = useState(false);
  const isDev = isDevUser(user?.email);

  const onBgText = colors.text;
  const onBgTextSecondary = colors.textSecondary;

  const { enabled: ambientEnabled, mode: ambientMode, loadSavedState } = useAmbientMoodFieldStore();
  const { enabled: horizonStarsEnabled, loadSavedState: loadHorizonStarsSavedState } = useHorizonStarsStore();
  const weeklyMoodWeights = useWeeklyMoodAggregation(captures);
  const [isScreenFocused, setIsScreenFocused] = useState(true);
  const [isAppActive, setIsAppActive] = useState(true);
  const [horizonStarsReady, setHorizonStarsReady] = useState(false);

  useEffect(() => {
    loadSavedState();
    loadHorizonStarsSavedState();
  }, []);

  useFocusEffect(
    useCallback(() => {
      setIsScreenFocused(true);
      return () => setIsScreenFocused(false);
    }, [])
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      setIsAppActive(nextAppState === 'active');
    });

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setHorizonStarsReady(true);
    }, 1200);

    return () => clearTimeout(timer);
  }, []);

  const isAmbientPaused = !ambientEnabled || !isScreenFocused || !isAppActive;
  // Theme dots are part of the background, not the ambient feature — only pause when truly invisible
  const isThemeDotsPaused = !isScreenFocused || !isAppActive;

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    // Scroll tracking removed with Lens removal
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const checkOnboarding = async () => {
      const hasCompleted = await AsyncStorage.getItem('has_completed_onboarding');
      const ALWAYS_SHOW_ONBOARDING = false;

      if ((hasCompleted !== 'true' || ALWAYS_SHOW_ONBOARDING) && !hasForcedOnboardingThisSession) {
        hasForcedOnboardingThisSession = true;
        router.replace('/onboarding');
      }
    };

    checkOnboarding();
    fetchCaptures(user).finally(() => setHasFetchedCaptures(true));
  }, [user]);

  // First-run empty state: only after captures have actually been fetched, so the
  // gentle prompt never flashes for returning users whose captures are still loading.
  const showFirstCaptureHint = hasFetchedCaptures && !loading && captures.length === 0;

  return (
    <ScreenWrapper
      edges={['top', 'left', 'right', 'bottom']}
      screenName="home"
      bottomInset={DEFAULT_TAB_BAR_HEIGHT}
      hideFloatingBackground={false}
    >
      {usesTimeTheme && activeGradient && horizonStarsReady && horizonStarsEnabled && (
        <View pointerEvents="none" style={styles.horizonStarsLayer}>
          <ThemeDots
            panelWidth={width}
            panelHeight={height}
            deg={activeGradient.deg}
            horizonPct={activeGradient.horizonPct}
            dots={activeGradient.dots}
            isPaused={isThemeDotsPaused}
          />
        </View>
      )}

      {ambientEnabled && (
        <AmbientMoodField
          moodWeights={weeklyMoodWeights}
          isPaused={isAmbientPaused}
        />
      )}

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        snapToInterval={pageHeight}
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        <View style={[styles.heroSection, { height: pageHeight }]}>
          <View style={[styles.headerContainer, { top: headerTop }]}>
            <ThemedText style={[styles.clockTime, { color: onBgText }]}>
              {getFormattedTime(currentTime, timeFormat)}
            </ThemedText>
            <ThemedText style={[styles.clockDate, { color: onBgTextSecondary }]}>
              {format(currentTime, 'EEEE, MMMM d')}
            </ThemedText>
          </View>

          {/* Dev portal button — only visible to dev accounts */}
          {isDev && (
            <TouchableOpacity
              onPress={() => setDevPortalVisible(true)}
              style={[styles.devButton, { top: insets.top + 14 }]}
              activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="flask-outline" size={17} color="rgba(255,107,53,0.85)" />
            </TouchableOpacity>
          )}

          <View style={styles.centerContainer}>
            <HomeActionCarousel />
          </View>

          {showFirstCaptureHint && (
            <Animated.View
              entering={FadeIn.duration(600)}
              pointerEvents="none"
              style={[
                styles.firstCaptureHint,
                { bottom: insets.bottom + DEFAULT_TAB_BAR_HEIGHT + 28 },
              ]}
            >
              <ThemedText style={[styles.firstCaptureTitle, { color: onBgText }]}>
                Capture your first moment
              </ThemedText>
              <ThemedText style={[styles.firstCaptureSubtitle, { color: onBgTextSecondary }]}>
                A photo, a note, your voice, or a mood — your day begins here.
              </ThemedText>
            </Animated.View>
          )}
        </View>

        {SHOW_YEAR_IN_PIXELS_MVP && (
          <View style={[styles.section, { height: pageHeight }]}>
            <YearInPixelsSection />
          </View>
        )}

        {SHOW_MONTHLY_PIXEL_VIEWER_MVP && (
          <View style={[styles.section, { height: pageHeight }]}>
            <DailyMonthlyPixelsSection />
          </View>
        )}

      </ScrollView>

      {pendingSaveAnimationUri && (
        <SaveCaptureAnimation
          imageUri={pendingSaveAnimationUri}
          moodGradient={pendingSaveMoodGradient ?? { primary: '#A8A8A8', mid: '#909090', secondary: '#808080' }}
          isSaving={!pendingSaveComplete}
          onComplete={() => {
            setPendingSaveAnimationUri(null);
            setPendingSaveMoodGradient(null);
            setPendingSaveComplete(false);
          }}
        />
      )}

      {isDev && (
        <DevPortalModal
          visible={devPortalVisible}
          onClose={() => setDevPortalVisible(false)}
        />
      )}
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 0,
  },
  section: {
    height,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  heroSection: {
    height,
    position: 'relative',
    paddingTop: 20,
  },
  horizonStarsLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  devButton: {
    position: 'absolute',
    right: 20,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,107,53,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,107,53,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },

  headerContainer: {
    position: 'absolute',
    top: 40,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  clockTime: {
    fontSize: 56,
    fontWeight: '700',
    lineHeight: 64,
    letterSpacing: -2,
  },
  clockDate: {
    fontSize: 24,
    fontWeight: '600',
    lineHeight: 30,
    marginTop: 12,
  },
  centerContainer: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    alignItems: 'center',
    transform: [{ translateY: -184 }],
  },
  firstCaptureHint: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 48,
  },
  firstCaptureTitle: {
    fontSize: 21,
    fontWeight: '600',
    letterSpacing: -0.3,
    textAlign: 'center',
    marginBottom: 8,
  },
  firstCaptureSubtitle: {
    fontSize: 14.5,
    lineHeight: 21,
    textAlign: 'center',
  },
});
