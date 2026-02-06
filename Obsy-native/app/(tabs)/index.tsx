import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { StyleSheet, View, ScrollView, Dimensions, TouchableOpacity, NativeSyntheticEvent, NativeScrollEvent, ActivityIndicator } from 'react-native';
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
import { GlassCard } from '@/components/ui/GlassCard';
import { InsightText } from '@/components/insights/InsightText';
import { TodayCollectionStack } from '@/components/home/TodayCollectionStack';
import { TodayInsightCard } from '@/components/home/TodayInsightCard';
import { YearInPixelsSection } from '@/components/home/YearInPixelsSection';
import { PulsingCameraTrigger } from '@/components/home/PulsingCameraTrigger';
import { useCaptureStore } from '@/lib/captureStore';
import { useTimeFormatStore, getFormattedTime } from '@/lib/timeFormatStore';
import { useAuth } from '@/contexts/AuthContext';
import { useObsyTheme } from '@/contexts/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { useTodayInsight } from '@/lib/todayInsightStore';
import Colors from '@/constants/Colors';
import { format, isSameDay } from 'date-fns';
import { getProfile } from '@/services/profile';
import { PremiumGate } from '@/components/PremiumGate';
import { NotificationBadge } from '@/components/ui/NotificationBadge';
import { useRouter } from 'expo-router';
import { DailyInsight } from '@/services/dailyInsights';
import { useMockAlbums } from '@/contexts/MockAlbumContext';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { height } = Dimensions.get('window');

// DEV ONLY: Keeps track of whether we've already forced the onboarding screen this session
// to prevent an infinite redirect loop.
let hasForcedOnboardingThisSession = false;

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const router = useRouter();
  const { captures, fetchCaptures, loading } = useCaptureStore();
  const { timeFormat } = useTimeFormatStore();
  const { colors, isLight } = useObsyTheme();
  const { getUnseenPhotoCount } = useMockAlbums();
  const pageHeight = Math.max(height - insets.top - insets.bottom, 1);
  const headerTop = Math.max(insets.top, 32) + 80; // ensure clock clears status bar/notch

  const { isRefreshing } = useTodayInsight();

  // Get unseen photo count for badge - uses actual count from context
  const unseenCount = getUnseenPhotoCount();

  // Live clock state
  const [currentTime, setCurrentTime] = useState(new Date());

  // Theme-aware on-background colors
  const onBgText = colors.text;
  const onBgTextSecondary = colors.textSecondary;
  const onBgTextTertiary = colors.textTertiary;

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
      hideFloatingBackground={false}
    >
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

          {/* Camera Ring - absolute positioned dead center */}
          <View style={styles.centerContainer}>
            <ThemedText style={[styles.dynamicGreeting, { color: onBgTextTertiary }]}>
              {getDynamicGreeting(currentTime)}
            </ThemedText>
            <PulsingCameraTrigger />
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
        </View>

        {/* SECTION 2: YEAR IN PIXELS */}
        <View style={[styles.section, { height: pageHeight }]}>
          <YearInPixelsSection />
        </View>


        {/* SECTION 3: INSIGHT - Full Screen Snap Pane */}
        <View style={[styles.section, { height: pageHeight }]}>
          <TodayInsightCard />
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
  // Center container - absolute dead center
  centerContainer: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    alignItems: 'center',
    transform: [{ translateY: -120 }],
  },
  // Dynamic greeting - above the ring
  dynamicGreeting: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 32,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  // Albums container - positioned below center
  albumsContainer: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    alignItems: 'center',
    transform: [{ translateY: 140 }],
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
});
