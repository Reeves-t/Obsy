import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { ScreenWrapper, DEFAULT_TAB_BAR_HEIGHT } from '@/components/ScreenWrapper';
import { HomeHeader } from '@/components/home/HomeHeader';
import { HeroSection } from '@/components/home/HeroSection';
import { HomeComposer } from '@/components/home/composer/HomeComposer';
import { RecentMemories } from '@/components/home/RecentMemories';
import { useCaptureStore } from '@/lib/captureStore';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SaveCaptureAnimation } from '@/components/capture/SaveCaptureAnimation';
import { ClipboardLinkPill } from '@/components/home/ClipboardLinkPill';
import { SharedLinksInbox } from '@/components/home/SharedLinksInbox';

let hasForcedOnboardingThisSession = false;

export default function HomeScreen() {
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

  const [hasFetchedCaptures, setHasFetchedCaptures] = useState(false);

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

  return (
    <ScreenWrapper
      edges={['top', 'left', 'right', 'bottom']}
      screenName="home"
      bottomInset={DEFAULT_TAB_BAR_HEIGHT}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
      >
        <HomeHeader />
        <HeroSection />
        <HomeComposer />
        {/* An offer about what is on the clipboard right now — sits with the
            composer because it is another way to start a capture, not part of
            the queue below. Renders nothing when there is no link to offer. */}
        <ClipboardLinkPill />
        <SharedLinksInbox />
        <RecentMemories
          captures={captures.slice(0, 12)}
          hasFetched={hasFetchedCaptures && !loading}
        />
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
  content: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 32,
  },
});
