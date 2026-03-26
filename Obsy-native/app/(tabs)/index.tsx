import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { StyleSheet, View, ScrollView, Dimensions, TouchableOpacity, NativeSyntheticEvent, NativeScrollEvent, ActivityIndicator, AppState } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  cancelAnimation
} from 'react-native-reanimated';
import { Image } from 'expo-image';
import { Link } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { ThemedText } from '@/components/ui/ThemedText';
import { TodayCollectionStack } from '@/components/home/TodayCollectionStack';
import { YearInPixelsSection } from '@/components/home/YearInPixelsSection';
import { DailyMonthlyPixelsSection } from '@/components/home/DailyMonthlyPixelsSection';
import { PulsingCameraTrigger } from '@/components/home/PulsingCameraTrigger';
import { LinearGradient } from 'expo-linear-gradient';
import { useCaptureStore } from '@/lib/captureStore';
import { useTimeFormatStore, getFormattedTime } from '@/lib/timeFormatStore';
import { useAuth } from '@/contexts/AuthContext';
import { useObsyTheme } from '@/contexts/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/Colors';
import { format, isSameDay } from 'date-fns';
import { getProfile } from '@/services/profile';
import { PremiumGate } from '@/components/PremiumGate';
import { NotificationBadge } from '@/components/ui/NotificationBadge';
import { useRouter } from 'expo-router';
import { useMockAlbums } from '@/contexts/MockAlbumContext';
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
  const { getUnseenPhotoCount } = useMockAlbums();
  const pageHeight = Math.max(height - insets.top - insets.bottom, 1);
  const headerTop = Math.max(insets.top, 32) + 80; // ensure clock clears status bar/notch

  // Get unseen photo count for badge - uses actual count from context
  const unseenCount = getUnseenPhotoCount();

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
                <TouchableOpacity
                  activeOpacity={0.75}
                  onPress={() => router.push('/voice')}
                  style={styles.voiceButton}
                >
                  <LinearGradient
                    colors={['rgba(255,255,255,0.05)', 'rgba(0,0,0,0.2)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />
                  <View style={styles.clusterButtonGlint} />
                  <Ionicons name="mic" size={15} color="rgba(255,255,255,0.7)" />
                </TouchableOpacity>
                <ThemedText style={[styles.clusterLabel, { color: onBgTextTertiary }]}>Voice</ThemedText>
              </View>

              {/* Journal button — bottom-left */}
              <View style={styles.journalButtonWrap}>
                <TouchableOpacity
                  activeOpacity={0.75}
                  onPress={() => router.push('/journal')}
                  style={styles.journalButton}
                >
                  <LinearGradient
                    colors={['rgba(255,255,255,0.05)', 'rgba(0,0,0,0.2)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />
                  <View style={styles.clusterButtonGlint} />
                  <Ionicons name="pencil" size={18} color="rgba(255,255,255,0.7)" />
                </TouchableOpacity>
                <ThemedText style={[styles.clusterLabel, { color: onBgTextTertiary }]}>Journal</ThemedText>
              </View>

              {/* Capture button — right, primary */}
              <View style={styles.captureButtonWrap}>
                <PulsingCameraTrigger />
                <ThemedText style={[styles.clusterLabel, { color: onBgTextTertiary }]}>Capture</ThemedText>
              </View>
            </View>
          </View>

          {/* Albums Pill - absolute positioned below camera ring */}
          <PremiumGate
            featureName="albums"
            guestAction="signup"
            onAction={() => router.push('/albums')}
            style={styles.albumsContainer}
          >
            <View style={[
              styles.albumsLink,
              {
                backgroundColor: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.05)',
                borderColor: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)'
              }
            ]}>
              <ThemedText style={[styles.albumsLinkText, { color: onBgTextSecondary }]}>Switch to Albums</ThemedText>
              <Ionicons name="chevron-forward" size={16} color={onBgTextTertiary} />

              <NotificationBadge
                count={unseenCount}
                style={styles.albumsBadge}
              />
            </View>
          </PremiumGate>

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
  // Center container - anchored to upper-center of screen
  centerContainer: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    alignItems: 'center',
    transform: [{ translateY: -80 }],
  },
  // Outer cluster — fixed size, absolute-positioned children form the triangle
  buttonCluster: {
    width: 172,  // left column (44px) + 16px gap + 64px capture + 16px capture wrapper margin = ~148, give extra room
    height: 96,  // 36px voice + 12px gap + 44px journal; capture (64px) centered at top:16
    position: 'relative',
  },
  // Voice button (36px) — top-left
  voiceButtonWrap: {
    position: 'absolute',
    top: 0,
    left: 4,  // slight centering over journal
    alignItems: 'center',
    gap: 4,
  },
  voiceButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#0D0D0D',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Journal button (44px) — bottom-left
  journalButtonWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    alignItems: 'center',
    gap: 4,
  },
  journalButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#0D0D0D',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Shared inner glint ring for small buttons
  clusterButtonGlint: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  // Capture button (64px via PulsingCameraTrigger) — right, vertically centered
  captureButtonWrap: {
    position: 'absolute',
    top: 8,   // (96 - 80px wrapper) / 2
    right: 0,
    alignItems: 'center',
  },
  // Small label below each button
  clusterLabel: {
    fontSize: 10,
    opacity: 0.4,
    letterSpacing: 0.3,
  },
  // Dynamic greeting - above the ring
  dynamicGreeting: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 32,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  // Albums container - positioned below cluster
  albumsContainer: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    alignItems: 'center',
    transform: [{ translateY: 60 }],
  },
  // Albums link pill
  albumsLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  albumsLinkText: {
    fontSize: 14,
  },
  albumsBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
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
