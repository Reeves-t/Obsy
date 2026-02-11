import React from 'react';
import { StyleSheet, View, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from '@/components/ui/ThemedText';
import { useObsyTheme } from '@/contexts/ThemeContext';
import { useYearInPixelsStore } from '@/lib/yearInPixelsStore';

interface PixelPaletteProps {
    maxHeight?: number;
}

export const PixelPalette: React.FC<PixelPaletteProps> = ({ maxHeight }) => {
    const { isDark, isLight } = useObsyTheme();
    const { legend, activeColorId, setActiveColorId } = useYearInPixelsStore();

    const mutedText = isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)';

    return (
        <View style={[styles.container, maxHeight ? { maxHeight } : undefined]}>
            <ThemedText style={[styles.title, { color: mutedText }]}>Palette</ThemedText>

            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.swatchList}
            >
                {legend.map((item) => {
                    const isActive = activeColorId === item.id;
                    return (
                        <TouchableOpacity
                            key={item.id}
                            style={styles.swatchRow}
                            onPress={() => setActiveColorId(isActive ? null : item.id)}
                            activeOpacity={0.7}
                        >
                            <View style={[
                                styles.swatch,
                                { backgroundColor: item.color },
                                isActive && styles.activeSwatch,
                            ]} />
                            <ThemedText
                                style={[styles.swatchLabel, { color: mutedText }]}
                                numberOfLines={1}
                            >
                                {item.label}
                            </ThemedText>
                        </TouchableOpacity>
                    );
                })}
            </ScrollView>

            {legend.length === 0 && (
                <ThemedText style={[styles.emptyHint, { color: mutedText }]}>
                    Add colors in{'\n'}Year in Pixels
                </ThemedText>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
        paddingVertical: 8,
    },
    title: {
        fontSize: 10,
        fontWeight: '600',
        letterSpacing: 1,
        textTransform: 'uppercase',
        marginBottom: 12,
    },
    swatchList: {
        alignItems: 'center',
        gap: 10,
        paddingBottom: 8,
    },
    swatchRow: {
        alignItems: 'center',
        gap: 3,
    },
    swatch: {
        width: 28,
        height: 28,
        borderRadius: 8,
    },
    activeSwatch: {
        borderWidth: 2,
        borderColor: '#D4AF37',
        shadowColor: '#D4AF37',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.4,
        shadowRadius: 6,
        elevation: 3,
    },
    swatchLabel: {
        fontSize: 8,
        fontWeight: '500',
        textAlign: 'center',
        maxWidth: 48,
    },
    emptyHint: {
        fontSize: 9,
        textAlign: 'center',
        lineHeight: 14,
        marginTop: 8,
    },
});
