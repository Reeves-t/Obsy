import React, { createContext, useContext } from 'react';
import { StyleSheet, View, ViewStyle, StyleProp } from 'react-native';
import { BlurView } from 'expo-blur';
import { useObsyTheme } from '@/contexts/ThemeContext';

// ─────────────────────────────────────────────────────────────────────────────
// Card Context - allows children to know they're inside a card
// ─────────────────────────────────────────────────────────────────────────────
const CardContext = createContext<boolean>(false);

/**
 * Hook to check if component is inside a GlassCard
 * Useful for ThemedText to determine proper text color in light theme
 */
export function useInCard(): boolean {
    return useContext(CardContext);
}

interface GlassCardProps {
    children: React.ReactNode;
    style?: StyleProp<ViewStyle>;
    intensity?: number;
    /** Set to false if child handles its own padding */
    noPadding?: boolean;
    variant?: 'default' | 'liquid' | 'simple';
}

export const GlassCard: React.FC<GlassCardProps> = ({
    children,
    style,
    intensity = 10, // Reduced from 20 to 10 for better performance
    noPadding = false,
    variant = 'default',
}) => {
    const { isDark, colors } = useObsyTheme();

    // Theme-aware styles
    // Light theme: near-black solid cards (no blur needed, it would lighten them)
    // Dark theme: semi-transparent with blur effect
    const themedContainerStyle = {
        backgroundColor: variant === 'simple' ? 'rgba(255,255,255,0.03)' : colors.cardBackground,
        borderColor: colors.cardBorder,
        shadowColor: isDark ? '#ffffff' : '#000000',
    };

    // Light theme uses solid dark cards - blur would make them look washed out
    // Dark theme uses blur for the frosted glass effect
    // 'simple' variant never uses blur
    const useBlur = isDark && variant !== 'simple';

    // Wrap children in CardContext so ThemedText knows it's inside a card
    const wrappedChildren = (
        <CardContext.Provider value={true}>
            {children}
        </CardContext.Provider>
    );

    return (
        <View style={[
            styles.container,
            variant === 'simple' && styles.simpleContainer,
            themedContainerStyle,
            style
        ]}>
            {useBlur ? (
                <BlurView
                    intensity={intensity}
                    tint="dark"
                    style={styles.blur}
                >
                    <View style={noPadding ? undefined : styles.content}>
                        {wrappedChildren}
                    </View>
                </BlurView>
            ) : (
                <View style={noPadding ? undefined : styles.content}>
                    {wrappedChildren}
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        borderRadius: 16,
        overflow: 'hidden',
        borderWidth: 1,
        // Glossy Shadow
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    simpleContainer: {
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
        shadowOpacity: 0.02,
    },
    blur: {
        // Let content determine height - don't force 100%
    },
    content: {
        padding: 16,
    },
});
