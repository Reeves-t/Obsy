import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { StyleSheet, View, ScrollView, Dimensions, NativeSyntheticEvent, NativeScrollEvent, AppState } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { ThemedText } from '@/components/ui/ThemedText';
import { TodayCollectionStack } from '@/components/home/TodayCollectionStack';
import { YearInPixelsSection } from '@/components/home/YearInPixelsSection';
import { DailyMonthlyPixelsSection } from '@/components/home/DailyMonthlyPixelsSection';
import { PulsingCameraTrigger } from '@/components/home/PulsingCameraTrigger';
import { AnimatedMicButton } from '@/components/home/AnimatedMicButton';
import { AnimatedJournalButton } from '@/components/home/AnimatedJournalButton';
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
import { useFocusEffect } from '@react-navigation/native';
import { SaveCaptureAnimation } from '@/components/capture/SaveCaptureAnimation';
import { MoodverseEntryCard } from '@/components/moodverse/MoodverseEntryCard';
import { GalaxyBackground } from '@/components/moodverse/GalaxyBackground';
import { computeGalaxyLayout, generateMockCaptures } from '@/components/moodverse/galaxyLayout';

const { height } = Dimensions.get('window');

// DEV ONLY: Keeps track of whether we've already forced the onboarding screen this session
// to prevent an infinite redirect loop.
let hasForcedOnboardingThisSession = false;

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const router = useRouter();
  const { captures, fetchCaptures, loading, pendingSaveAnimationUri, setPendingSaveAnimationUri, pendingSaveMoodGradient, setPendingSaveMoodGradient, pendingSaveComplete, setPendingSaveComplete } = useCaptureStore();
  const { timeFormat } = useTimeFormatStore();
  const { colors, isLight } = useObsyTheme();
  const pageHeight = Math.max(height - insets.top - insets.bottom, 1);
  const headerTop = Math.max(insets.top, 32) + 80; // ensure clock clears status bar/notch

  // Live clock state
  const [currentTime, setCurrentTime] = useState(new Date());

  // Theme-aware on-background colors
  const onBgText = colors.text;
  const onBgTextSecondary = colors.textSecondary;
  const onBgTextTertiary = colors.textTertiary;

  // Ambient Mood Field
  const { enabled: ambientEnabled, mode: ambientMode, loadSavedState } = useAmbientMoodFieldStore();
  const weeklyMoodWeights = useWeeklyMoodAggregation(captures);
  const [isScreenFocused, setIsScreenFocused] = useState(true);
  const [isAppActive, setIsAppActive] = useState(true);

  // Load ambient mood field settings on mount
  useEffect(() => {
    loadSavedState();
  }, []);

  // Track screen focus (pause when navigating to other tabs)
  useFocusEffect(
    useCallback(() => {
      setIsScreenFocused(true);
      return () => setIsScreenFocused(false);
    }, [])
  );

  // Track app state (pause when app goes to background)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      setIsAppActive(nextAppState === 'active');
    });

    return () => subscription.remove();
  }, []);

  // Determine if ambient field should be paused
  const isAmbientPaused = !ambientEnabled || !isScreenFocused || !isAppActive;

  // Galaxy background data (only computed when moodverse mode is active)
  const currentYear = useMemo(() => new Date().getFullYear(), []);
  const galaxyData = useMemo(() => {
    if (ambientMode !== 'moodverse' || !user?.id) return null;
    const src = captures.length > 0 ? captures : generateMockCaptures(user.id, currentYear);
    return computeGalaxyLayout(src, user.id, currentYear);
  }, [ambientMode, captures, user?.id, currentYear]);

  // GL context safety: only mount when home is focused + app is active
  const shouldMountGalaxy = ambientEnabled && ambientMode === 'moodverse' && isScreenFocused && isAppActive;

  // Handle scroll (placeholder for potential future needs, currently simplified)
  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    // Scroll tracking removed with Lens removal
  }, []);

  // Update clock every minute
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Update every minute

    return () => clearInterval(timer);
  }, []);

  // Dynamic greeting based on hour
  const getDynamicGreeting = useCallback((date: Date): string => {
    const hour = date.getHours();
    if (hour >= 5 && hour < 11) return "Set the tone.";
    if (hour >= 11 && hour < 14) return "Midday check.";
    if (hour >= 14 && hour < 18) return "Afternoon focus.";
    if (hour >= 18 && hour < 22) return "Closing thoughts.";
    return "Late night thoughts.";
  }, []);

  useEffect(() => {
    const checkOnboarding = async () => {
      const hasCompleted = await AsyncStorage.getItem('has_completed_onboarding');

      // DEV ONLY: Set this to true to force the onboarding screen on every app load.
      // We use a module-level variable to ensure it only happens ONCE per session
      // to avoid an infinite loop between Home and Onboarding.
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
    return captures.filter((c) => isSameDay(new Date(c.created_at), today));
  }, [captures]);

  return (
    <ScreenWrapper
      edges={['top', 'left', 'right', 'bottom']}
      screenName="home"
      hideFloatingBackground={ambientEnabled && ambientMode === 'moodverse'}
    >
      {/* Ambient Background - Behind all content */}
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
        snapToInterval={pageHeight} // Full screen snap
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >

        {/* SECTION 1: HERO - Cyber/Minimal Dashboard */}
        <View style={[styles.heroSection, { height: pageHeight }]}>
          {/* Time & Date Header - absolute positioned at top */}
          <View style={[styles.headerContainer, { top: headerTop }]}>
            <ThemedText style={[styles.clockTime, { color: onBgText }]}>
              {getFormattedTime(currentTime, timeFormat)}
            </ThemedText>
            <ThemedText style={[styles.clockDate, { color: onBgTextSecondary }]}>
              {format(currentTime, 'EEEE, MMMM d')}
            </ThemedText>
          </View>

          {/* Button cluster — voice (top-left), journal (bottom-left), capture (right) */}
          <View style={styles.centerContainer}>
            <ThemedText style={[styles.dynamicGreeting, { color: onBgTextTertiary }]}>
              {getDynamicGreeting(currentTime)}
            </ThemedText>
            <View style={styles.buttonCluster}>
              {/* Voice button — top-left */}
              <View style={styles.voiceButtonWrap}>
                <AnimatedMicButton />
              </View>

              {/* Journal button — bottom-left */}
              <View style={styles.journalButtonWrap}>
                <AnimatedJournalButton />
              </View>

              {/* Capture button — right, primary */}
              <View style={styles.captureButtonWrap}>
                <PulsingCameraTrigger />
              </View>
            </View>
          </View>

          {/* Moodverse entry — bottom of hero */}
          <View style={[styles.moodverseContainer, { bottom: insets.bottom + 48 }]}>
            <MoodverseEntryCard />
          </View>
        </View>

        {/* SECTION 2: YEAR IN PIXELS */}
        <View style={[styles.section, { height: pageHeight }]}>
          <YearInPixelsSection />
        </View>


        {/* SECTION 3: DAILY / MONTHLY PIXELS */}
        <View style={[styles.section, { height: pageHeight }]}>
          <DailyMonthlyPixelsSection />
        </View>

        {/* SECTION 4: COLLECTION */}
        {todayCaptures.length > 0 && (
          <View style={[styles.section, { height: pageHeight }]}>
            <View style={styles.collectionHeader}>
              <ThemedText type="caption" style={[styles.collectionTitle, { color: onBgTextTertiary }]}>TODAY'S COLLECTION</ThemedText>
              <ThemedText type="caption" style={[styles.collectionDate, { color: onBgTextTertiary }]}>{format(new Date(), "MMM d")}</ThemedText>
            </View>

            <TodayCollectionStack captures={todayCaptures} />
          </View>
        )}


      </ScrollView>

      {/* Save Capture Animation — plays on home screen after review navigates here */}
      {pendingSaveAnimationUri && (
        <SaveCaptureAnimation
          imageUri={pendingSaveAnimationUri}
          moodGradient={pendingSaveMoodGradient ?? { from: '#A8A8A8', to: '#808080' }}
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
    height: height, // Full screen height for snap
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  heroSection: {
    height: height,
    position: 'relative',
    paddingTop: 20,
  },
  // Header container - absolute at top, top position set dynamically via inline style
  headerContainer: {
    position: 'absolute',
    top: 40,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  // Time - large, bold
  clockTime: {
    fontSize: 56,
    fontWeight: '700',
    lineHeight: 64,
    letterSpacing: -2,
  },
  // Date - larger, slightly muted
  clockDate: {
    fontSize: 24,
    fontWeight: '600',
    lineHeight: 30,
    marginTop: 12,
  },
  // Center container - absolute dead center (same as original)
  centerContainer: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 20,
    alignItems: 'center',
    transform: [{ translateY: -120 }],
  },
  // Cluster container — capture anchored right, voice+journal float left
  buttonCluster: {
    width: 260,
    height: 210,
    position: 'relative',
  },
  // Capture — anchored to right
  captureButtonWrap: {
    position: 'absolute',
    right: 0,
    top: 6,
    alignItems: 'center',
  },
  // Voice — top-left of capture
  voiceButtonWrap: {
    position: 'absolute',
    top: 6,
    left: 0,
    alignItems: 'center',
  },
  // Journal — bottom-left of capture
  journalButtonWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    alignItems: 'center',
  },
  // Dynamic greeting - above the ring
  dynamicGreeting: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 32,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  // Insight card styles removed - now handled by TodayInsightCard
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
  collectionDate: {
  },
  moodverseContainer: {
    position: 'absolute',
    left: 20,
    right: 20,
  },
});
