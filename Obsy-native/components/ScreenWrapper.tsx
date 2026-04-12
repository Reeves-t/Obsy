import React from 'react';
import { StyleSheet, View, ViewStyle, StatusBar } from 'react-native';
import { SafeAreaView, Edge } from 'react-native-safe-area-context';
import { FloatingBackgroundController } from '@/components/backgrounds/FloatingBackgroundController';
import { AmbientBackground } from '@/components/ui/AmbientBackground';
import { useObsyTheme } from '@/contexts/ThemeContext';

export const DEFAULT_TAB_BAR_HEIGHT = 84;

interface ScreenWrapperProps {
    children: React.ReactNode;
    style?: ViewStyle;
    withSafeArea?: boolean;
    hideFloatingBackground?: boolean;
    bottomInset?: number;
    edges?: Edge[];
    screenName?: 'home' | 'gallery' | 'insights' | 'profile' | 'archive' | 'onboarding' | 'albums';
}

export const ScreenWrapper: React.FC<ScreenWrapperProps> = ({
    children,
    style,
    withSafeArea = true,
    hideFloatingBackground = false,
    bottomInset = 0,
    edges = ['top', 'left', 'right', 'bottom'],
    screenName
}) => {
    const { isDark } = useObsyTheme();
    const isOnboarding = screenName === 'onboarding';
    const statusBarStyle = isOnboarding ? (isDark ? 'light-content' : 'dark-content') : 'light-content';

    return (
        <View style={styles.wrapper}>
            {/* Ambient background with themed base + corner glow orbs - first child, sits at bottom */}
            <AmbientBackground screenName={screenName} />

            {/* Floating background with captures - logic handled in controller */}
            {!hideFloatingBackground && <FloatingBackgroundController screenName={screenName} />}

            {/* StatusBar: light icons on dark bg, dark icons on light bg */}
            <StatusBar barStyle={statusBarStyle} />

            {/* Main content */}
            {withSafeArea ? (
                <SafeAreaView style={[styles.container, { paddingBottom: bottomInset }, style]} edges={edges}>
                    {children}
                </SafeAreaView>
            ) : (
                <View style={[styles.container, { paddingBottom: bottomInset }, style]}>
                    {children}
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    wrapper: {
        flex: 1,
        // No backgroundColor here - AmbientBackground handles the themed base
    },
    container: {
        flex: 1,
    },
});
