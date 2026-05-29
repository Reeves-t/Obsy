import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { ThemedText } from '@/components/ui/ThemedText';
import { useObsyTheme } from '@/contexts/ThemeContext';
import { getPatternTokens } from './tokens';
import type { PatternTheme } from '@/types/patternKeywords';

interface ThemeChipProps {
    theme: PatternTheme;
    active: boolean;
    color: string;
    onPress: () => void;
}

export const ThemeChip: React.FC<ThemeChipProps> = ({ theme, active, color, onPress }) => {
    const { isLight } = useObsyTheme();
    const tokens = getPatternTokens(isLight);

    return (
        <TouchableOpacity
            onPress={onPress}
            activeOpacity={0.85}
            style={[
                styles.chip,
                {
                    backgroundColor: active ? color : tokens.paper,
                    borderColor: active ? color : tokens.line,
                    transform: [{ translateY: active ? -1 : 0 }],
                },
            ]}
        >
            <ThemedText
                style={[
                    styles.name,
                    { color: active ? '#FFF8EE' : tokens.ink },
                ]}
                numberOfLines={2}
            >
                {theme.name}
            </ThemedText>
            <ThemedText
                style={[
                    styles.mentions,
                    { color: active ? 'rgba(255,248,238,0.8)' : tokens.ink3 },
                ]}
            >
                {theme.mentions} mentions
            </ThemedText>
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    chip: {
        padding: 14,
        borderRadius: 14,
        borderWidth: 1,
        height: 88,
        justifyContent: 'space-between',
        flex: 1,
    },
    name: { fontSize: 17, lineHeight: 19, letterSpacing: -0.2, fontWeight: '500' },
    mentions: { fontSize: 10.5, letterSpacing: 0.2, marginTop: 4 },
});
