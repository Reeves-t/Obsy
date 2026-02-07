import React, { useState, useEffect } from 'react';
import {
    StyleSheet,
    View,
    TouchableOpacity,
    Dimensions,
    TextInput,
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    TouchableWithoutFeedback,
    Keyboard,
    ScrollView
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { ThemedText } from '@/components/ui/ThemedText';
import { ProgressIndicator } from '@/components/onboarding/ProgressIndicator';
import { createCustomTone, validateCustomTone } from '@/lib/customTone';
import { updateProfile } from '@/services/profile';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

const { width, height } = Dimensions.get('window');

interface OnboardingScreen {
    eyebrow: string;
    headline: string;
    body: string;
    isTone?: boolean;
    isAuth?: boolean;
}

const ONBOARDING_SCREENS: OnboardingScreen[] = [
    {
        eyebrow: "Welcome to Obsy",
        headline: "Observe Your Day.",
        body: "Obsy is a visual micro-journal designed to help you notice moments as they happen, quietly, without distraction."
    },
    {
        eyebrow: "HOW OBSY WORKS",
        headline: "Your Day, Captured Once.",
        body: "Obsy is built around a daily rhythm.\n\nYour captures form a single daily canvas, refreshed each day, shaped by moments as they happen.\nAfter your first capture, your day begins to take shape.\n\nEach day stands on its own.\nPast days are stored safely in your archive, with weekly and monthly summaries available whenever you want to look back.\n\nNo feeds.\nNo endless scrolling.\nJust today, and what mattered."
    },
    {
        eyebrow: "How It's Used",
        headline: "Moments, Not Selfies.",
        body: "Obsy isn't about capturing yourself. It's about capturing objects, scenes, and small details from your day, and how they made you feel."
    },
    {
        eyebrow: "Your Data",
        headline: "Private by Default.",
        body: "Your content is never used to train AI. Your data stays yours, stored locally, with the option to export to the cloud if space becomes an issue."
    },
    {
        eyebrow: "One Last Thing",
        headline: "Your Account.",
        body: "Sign in to sync your captures and insights across devices, or continue as a guest to get started right away.",
        isAuth: true
    },
    {
        eyebrow: "Your Voice",
        headline: "Set the Tone.",
        body: "Choose how Obsy reflects your day. Create a custom tone for your insights, how moments are viewed, interpreted, and written back to you.\n\nIt can be neutral, gently playful, softly critical, or inspired by any style you enjoy. There are no rules.",
        isTone: true
    }
];

export default function OnboardingScreen() {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [toneName, setToneName] = useState('');
    const [tonePrompt, setTonePrompt] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const router = useRouter();

    // Trigger haptic on every page change
    useEffect(() => {
        if (currentIndex > 0) {
            Haptics.selectionAsync();
        }
    }, [currentIndex]);

    const saveToneIfNeeded = async () => {
        if (!tonePrompt) return true;

        const validation = validateCustomTone(toneName || 'My Tone', tonePrompt);
        if (!validation.valid) {
            setError(validation.error || 'Invalid input');
            return false;
        }

        setIsSaving(true);
        try {
            const newTone = await createCustomTone(toneName || 'My Tone', tonePrompt);
            if (newTone) {
                await updateProfile({
                    ai_tone: 'custom',
                    selected_custom_tone_id: newTone.id
                });
            }
        } catch (e: any) {
            console.error('Failed to save onboarding tone:', e);
        } finally {
            setIsSaving(false);
        }
        return true;
    };

    const handleNext = async () => {
        const screen = ONBOARDING_SCREENS[currentIndex];

        // On tone screen (final), save the tone and finish
        if (screen.isTone) {
            if (tonePrompt) {
                const ok = await saveToneIfNeeded();
                if (!ok) return;
            }
            await completeOnboarding();
            return;
        }

        if (currentIndex < ONBOARDING_SCREENS.length - 1) {
            setCurrentIndex(currentIndex + 1);
            return;
        }

        await completeOnboarding();
    };

    const completeOnboarding = async () => {
        await AsyncStorage.setItem('has_completed_onboarding', 'true');
        router.replace('/(tabs)');
    };

    const handleSkip = async () => {
        await completeOnboarding();
    };

    const handleSignIn = () => {
        // Mark onboarding as complete so they don't loop back
        AsyncStorage.setItem('has_completed_onboarding', 'true');
        router.replace('/auth/login');
    };

    const handleCreateAccount = () => {
        AsyncStorage.setItem('has_completed_onboarding', 'true');
        router.replace('/auth/signup');
    };

    const handleContinueAsGuest = () => {
        // Advance to tone screen (next screen after auth)
        setCurrentIndex(currentIndex + 1);
    };

    const screen = ONBOARDING_SCREENS[currentIndex];

    const getFont = (weight: '300' | '400' | '600' | '700') => {
        switch (weight) {
            case '300': return 'Inter_300Light';
            case '400': return 'Inter_400Regular';
            case '600': return 'Inter_600SemiBold';
            case '700': return 'Inter_700Bold';
            default: return 'Inter_400Regular';
        }
    };

    return (
        <ScreenWrapper screenName="onboarding" style={styles.outerContainer}>
            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
                    <View style={styles.container}>
                        {/* Top: Progress Indicator */}
                        <View style={styles.header}>
                            <ProgressIndicator current={currentIndex} total={ONBOARDING_SCREENS.length} />
                        </View>

                        {/* Middle: Content */}
                        <ScrollView
                            style={{ flex: 1 }}
                            contentContainerStyle={styles.scrollContent}
                            showsVerticalScrollIndicator={false}
                            keyboardShouldPersistTaps="handled"
                        >
                            <Animated.View
                                key={currentIndex}
                                entering={FadeIn.duration(400)}
                                exiting={FadeOut.duration(400)}
                                style={styles.slide}
                            >
                                <ThemedText style={[styles.eyebrow, { fontFamily: getFont('400') }]}>
                                    {screen.eyebrow}
                                </ThemedText>
                                <ThemedText style={[styles.headline, { fontFamily: getFont('300') }]}>
                                    {screen.headline}
                                </ThemedText>
                                <ThemedText style={[styles.body, { fontFamily: getFont('400') }]}>
                                    {screen.body}
                                </ThemedText>

                                {/* Tone creation inputs */}
                                {screen.isTone && (
                                    <View style={styles.toneSection}>
                                        <TextInput
                                            style={[styles.input, { fontFamily: getFont('400') }]}
                                            value={toneName}
                                            onChangeText={setToneName}
                                            placeholder="Tone name (e.g. Noir, Gentle Roast, Minimal)"
                                            placeholderTextColor="rgba(255,255,255,0.3)"
                                            maxLength={50}
                                        />
                                        <TextInput
                                            style={[styles.input, styles.textArea, { fontFamily: getFont('400') }]}
                                            value={tonePrompt}
                                            onChangeText={setTonePrompt}
                                            placeholder="Describe how insights should be written or viewed…"
                                            placeholderTextColor="rgba(255,255,255,0.3)"
                                            multiline
                                            numberOfLines={3}
                                            maxLength={250}
                                        />
                                        {error && <ThemedText style={styles.errorText}>{error}</ThemedText>}
                                    </View>
                                )}

                                {/* Auth screen buttons */}
                                {screen.isAuth && (
                                    <View style={styles.authSection}>
                                        <TouchableOpacity
                                            style={styles.authPrimaryButton}
                                            onPress={handleCreateAccount}
                                        >
                                            <ThemedText style={[styles.authPrimaryText, { fontFamily: getFont('600') }]}>
                                                Create Account
                                            </ThemedText>
                                        </TouchableOpacity>

                                        <TouchableOpacity
                                            style={styles.authSecondaryButton}
                                            onPress={handleSignIn}
                                        >
                                            <ThemedText style={[styles.authSecondaryText, { fontFamily: getFont('600') }]}>
                                                Sign In
                                            </ThemedText>
                                        </TouchableOpacity>

                                        <TouchableOpacity
                                            style={styles.guestButton}
                                            onPress={handleContinueAsGuest}
                                        >
                                            <ThemedText style={[styles.guestText, { fontFamily: getFont('400') }]}>
                                                Continue as Guest
                                            </ThemedText>
                                        </TouchableOpacity>
                                    </View>
                                )}
                            </Animated.View>
                        </ScrollView>

                        {/* Bottom: Navigation (hidden on auth screen) */}
                        {!screen.isAuth && (
                            <View style={styles.footer}>
                                <TouchableOpacity onPress={handleSkip} style={styles.skipButton}>
                                    <ThemedText style={[styles.skipText, { fontFamily: getFont('400') }]}>Skip</ThemedText>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={styles.nextButton}
                                    onPress={handleNext}
                                    disabled={isSaving}
                                >
                                    {isSaving ? (
                                        <ActivityIndicator color="#000" />
                                    ) : (
                                        <ThemedText style={[styles.nextText, { fontFamily: getFont('600') }]}>
                                            {currentIndex === ONBOARDING_SCREENS.length - 1 ? "Get Started" : "Next"}
                                        </ThemedText>
                                    )}
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>
                </TouchableWithoutFeedback>
            </KeyboardAvoidingView>
        </ScreenWrapper>
    );
}

const styles = StyleSheet.create({
    outerContainer: {
        backgroundColor: 'transparent',
    },
    container: {
        flex: 1,
        paddingHorizontal: 24,
    },
    header: {
        marginTop: 60,
        alignItems: 'center',
        zIndex: 10,
    },
    scrollContent: {
        flexGrow: 1,
        justifyContent: 'flex-end',
        paddingBottom: 140,
        paddingHorizontal: 24,
    },
    slide: {
        width: '100%',
    },
    eyebrow: {
        fontSize: 12,
        letterSpacing: 1.5,
        textTransform: 'uppercase',
        color: 'rgba(255, 255, 255, 0.5)',
        marginBottom: 16,
    },
    headline: {
        fontSize: 32,
        lineHeight: 40,
        color: '#FFFFFF',
        marginBottom: 16,
        letterSpacing: -0.5,
    },
    body: {
        fontSize: 16,
        lineHeight: 24,
        color: 'rgba(255, 255, 255, 0.7)',
    },
    toneSection: {
        marginTop: 32,
        gap: 12,
    },
    input: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 12,
        padding: 16,
        color: '#fff',
        fontSize: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    textArea: {
        height: 100,
        textAlignVertical: 'top',
    },
    errorText: {
        color: '#F87171',
        fontSize: 12,
        marginTop: -4,
    },
    // Auth screen
    authSection: {
        marginTop: 40,
        gap: 14,
    },
    authPrimaryButton: {
        backgroundColor: '#FFFFFF',
        paddingVertical: 16,
        borderRadius: 14,
        alignItems: 'center',
    },
    authPrimaryText: {
        color: '#000000',
        fontSize: 17,
    },
    authSecondaryButton: {
        backgroundColor: 'rgba(255,255,255,0.1)',
        paddingVertical: 16,
        borderRadius: 14,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.15)',
    },
    authSecondaryText: {
        color: '#FFFFFF',
        fontSize: 17,
    },
    guestButton: {
        paddingVertical: 14,
        alignItems: 'center',
        marginTop: 4,
    },
    guestText: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 15,
    },
    // Footer nav
    footer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 24,
        paddingBottom: 40,
        backgroundColor: 'transparent',
    },
    skipButton: {
        padding: 8,
    },
    skipText: {
        fontSize: 16,
        color: 'rgba(255, 255, 255, 0.5)',
    },
    nextButton: {
        backgroundColor: '#FFFFFF',
        paddingHorizontal: 32,
        paddingVertical: 14,
        borderRadius: 24,
        minWidth: 100,
        alignItems: 'center',
        justifyContent: 'center',
    },
    nextText: {
        color: '#000000',
        fontSize: 16,
    },
});
