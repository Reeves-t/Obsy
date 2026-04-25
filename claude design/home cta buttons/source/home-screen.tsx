import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { StyleSheet, View, ScrollView, Dimensions, NativeSyntheticEvent, NativeScrollEvent, AppState } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { ThemedText } from '@/components/ui/ThemedText';
import { TodayCollectionStack } from '@/components/home/TodayCollectionStack';
import { YearInPixelsSection } from '@/components/home/YearInPixelsSection';
import { DailyMonthlyPixelsSection } from '@/components/home/DailyMonthlyPixelsSection';
import { HomeActionCarousel } from '@/components/home/HomeActionCarousel';
import { ThemeDots } from '@/components/home/ThemeDots';
import { useCaptureStore } from '@/lib/captureStore';
import { useTimeFormatStore, getFormattedTime } from '@/lib/timeFormatStore';
import { useAuth } from '@/contexts/AuthContext';
import { useObsyTheme } from '@/contexts/ThemeContext';
import { format, isSameDay } from 'date-fns';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AmbientMoodField } from '@/components/ambient/AmbientMoodField';
import { useWeeklyMoodAggregation } from '@/hooks/useWeeklyMoodAggregation';
import { useAmbientMoodFieldStore } from '@/lib/ambientMoodFieldStore';
import { useHorizonStarsStore } from '@/lib/horizonStarsStore';
import { useFocusEffect } from '@react-navigation/native';
import { SaveCaptureAnimation } from '@/components/capture/SaveCaptureAnimation';
import { MoodverseEntryCard } from '@/components/moodverse/MoodverseEntryCard';
import { GalaxyBackground } from '@/components/moodverse/GalaxyBackground';
import { computeGalaxyLayout, generateMockCaptures } from '@/components/moodverse/galaxyLayout';
import { DEFAULT_TAB_BAR_HEIGHT } from '@/components/ScreenWrapper';

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

  const onBgText = colors.text;
  const onBgTextSecondary = colors.textSecondary;
  const onBgTextTertiary = colors.textTertiary;

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

  const currentYear = useMemo(() => new Date().getFullYear(), []);
  const galaxyData = useMemo(() => {
    if (ambientMode !== 'moodverse' || !user?.id) return null;
    const src = captures.length > 0 ? captures : generateMockCaptures(user.id, currentYear);
    return computeGalaxyLayout(src, user.id, currentYear);
  }, [ambientMode, captures, user?.id, currentYear]);

  const shouldMountGalaxy = ambientEnabled && ambientMode === 'moodverse' && isScreenFocused && isAppActive;

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
      const ALWAYS_SHOW_ONBOARDING = true;

      if ((hasCompleted !== 'true' || ALWAYS_SHOW_ONBOARDING) && !hasForcedOnboardingThisSession) {
        hasForcedOnboardingThisSession = true;
        router.replace('/onboarding');
      }
    };

    checkOnboarding();
    fetchCaptures(user);
  }, [user]);

  const todayCaptures = useMemo(() => {
    const today = new Date();
    return captures.filter((capture) => isSameDay(new Date(capture.created_at), today));
  }, [captures]);

  return (
    <ScreenWrapper
      edges={['top', 'left', 'right', 'bottom']}
      screenName="home"
      bottomInset={DEFAULT_TAB_BAR_HEIGHT}
      hideFloatingBackground={ambientEnabled && ambientMode === 'moodverse'}
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

      {ambientEnabled && ambientMode === 'sparkles' && (
        <AmbientMoodField
          moodWeights={weeklyMoodWeights}
          isPaused={isAmbientPaused}
        />
      )}

      {shouldMountGalaxy && galaxyData && (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <View style={{ flex: 1, opacity: 0.45 }}>
            <GalaxyBackground
              orbs={galaxyData.orbs}
              clusters={galaxyData.clusters}
              isPaused={false}
            />
          </View>
        </View>
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

          <View style={styles.centerContainer}>
            <HomeActionCarousel />
          </View>

          <View style={[styles.moodverseContainer, { bottom: insets.bottom + 48 }]}>
            <MoodverseEntryCard />
          </View>
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

        {todayCaptures.length > 0 && (
          <View style={[styles.section, { height: pageHeight }]}> 
            <View style={styles.collectionHeader}>
              <ThemedText type="caption" style={[styles.collectionTitle, { color: onBgTextTertiary }]}>TODAY'S COLLECTION</ThemedText>
              <ThemedText type="caption" style={[styles.collectionDate, { color: onBgTextTertiary }]}>{format(new Date(), 'MMM d')}</ThemedText>
            </View>

            <TodayCollectionStack captures={todayCaptures} />
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
  collectionHeader: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
    paddingHorizontal: 4,
  },
  collectionTitle: {
    letterSpacing: 1,
  },
  collectionDate: {},
  moodverseContainer: {
    position: 'absolute',
    left: 20,
    right: 20,
  },
});
