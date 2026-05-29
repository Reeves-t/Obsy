import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { ThemedText } from '@/components/ui/ThemedText';
import { useObsyTheme } from '@/contexts/ThemeContext';
import { getPatternTokens, CATEGORY_META } from './tokens';
import type { PatternCategory } from '@/types/patternKeywords';

const ORDER: PatternCategory[] = ['positive', 'draining', 'emerging'];

interface CategoryTabsProps {
    value: PatternCategory;
    onChange: (category: PatternCategory) => void;
}

export const CategoryTabs: React.FC<CategoryTabsProps> = ({ value, onChange }) => {
    const { isLight } = useObsyTheme();
    const tokens = getPatternTokens(isLight);

    return (
        <View style={[styles.container, { backgroundColor: tokens.bg, borderColor: tokens.line }]}>
            {ORDER.map((k) => {
                const meta = CATEGORY_META[k];
                const active = value === k;
                return (
                    <TouchableOpacity
                        key={k}
                        onPress={() => onChange(k)}
                        activeOpacity={0.8}
                        style={[
                            styles.tab,
                            active && {
                                backgroundColor: isLight ? '#FFFFFF' : 'rgba(255,255,255,0.08)',
                                shadowColor: '#000',
                                shadowOffset: { width: 0, height: 2 },
                                shadowOpacity: isLight ? 0.06 : 0,
                                shadowRadius: 6,
                                elevation: active ? 2 : 0,
                            },
                        ]}
                    >
                        <View style={[styles.dot, { backgroundColor: meta.color, opacity: active ? 1 : 0.35 }]} />
                        <ThemedText
                            style={[
                                styles.label,
                                { color: active ? tokens.ink : tokens.ink3, fontWeight: active ? '600' : '500' },
                            ]}
                        >
                            {meta.label}
                        </ThemedText>
                    </TouchableOpacity>
                );
            })}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        padding: 4,
        gap: 4,
        borderRadius: 14,
        borderWidth: 1,
    },
    tab: {
        flex: 1,
        paddingVertical: 9,
        paddingHorizontal: 6,
        borderRadius: 11,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
    },
    dot: { width: 6, height: 6, borderRadius: 99 },
    label: { fontSize: 13, letterSpacing: 0.1 },
});
