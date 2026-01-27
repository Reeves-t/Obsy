import React from 'react';
import { Text, TextProps, StyleSheet } from 'react-native';
import Colors from '@/constants/Colors';
import { useObsyTheme } from '@/contexts/ThemeContext';
import { useInCard } from '@/components/ui/GlassCard';

export type ThemedTextType = 'default' | 'title' | 'defaultSemiBold' | 'subtitle' | 'link' | 'caption';

export type ThemedTextProps = TextProps & {
    type?: ThemedTextType;
    lightColor?: string;
    darkColor?: string;
    /**
     * Override: force text to use card colors (white on light theme)
     * Normally auto-detected via CardContext from GlassCard
     */
    forceCardStyle?: boolean;
};

export function ThemedText({
    style,
    lightColor,
    darkColor,
    type = 'default',
    forceCardStyle,
    ...rest
}: ThemedTextProps) {
    const { colors, isDark, isLight } = useObsyTheme();

    // Auto-detect if inside a GlassCard via context
    const contextInCard = useInCard();
    const inCard = forceCardStyle ?? contextInCard;

    // Determine text color based on context
    // Light theme + inside card = white text (cards are dark)
    // Light theme + on background = dark text
    // Dark theme = always white text
    let textColor: string;
    if (inCard && isLight) {
        textColor = colors.cardText; // White text inside cards on light theme
    } else {
        textColor = colors.text; // Default theme text color
    }

    // Caption and link have special colors, also respecting inCard context
    let captionColor: string;
    let linkColor: string;
    if (inCard && isLight) {
        captionColor = colors.cardTextSecondary;
        linkColor = colors.cardText;
    } else {
        captionColor = isDark ? Colors.obsy.silverStrong : 'rgba(26,26,26,0.6)';
        linkColor = isDark ? Colors.obsy.silver : '#1A1A1A';
    }

    return (
        <Text
            style={[
                { color: textColor },
                type === 'default' ? styles.default : undefined,
                type === 'title' ? styles.title : undefined,
                type === 'defaultSemiBold' ? styles.defaultSemiBold : undefined,
                type === 'subtitle' ? styles.subtitle : undefined,
                type === 'link' ? [styles.link, { color: linkColor }] : undefined,
                type === 'caption' ? [styles.caption, { color: captionColor }] : undefined,
                style,
            ]}
            {...rest}
        />
    );
}

const styles = StyleSheet.create({
    default: {
        fontSize: 16,
        lineHeight: 24,
    },
    defaultSemiBold: {
        fontSize: 16,
        lineHeight: 24,
        fontWeight: '600',
    },
    title: {
        fontSize: 32,
        fontWeight: 'bold',
        lineHeight: 32,
    },
    subtitle: {
        fontSize: 20,
        fontWeight: 'bold',
    },
    link: {
        lineHeight: 30,
        fontSize: 16,
    },
    caption: {
        fontSize: 12,
    }
});
