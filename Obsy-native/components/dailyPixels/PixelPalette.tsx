import React from 'react';
import { StyleSheet, View, TouchableOpacity, ScrollView } from 'react-native';
import { ThemedText } from '@/components/ui/ThemedText';
import { useYearInPixelsStore } from '@/lib/yearInPixelsStore';
import { useObsyTheme } from '@/contexts/ThemeContext';

const GOLD = '#D4AF37';

interface PixelPaletteProps {
    maxHeight?: number;
}

export const PixelPalette: React.FC<PixelPaletteProps> = ({ maxHeight }) => {
    const { legend, activeColorId, setActiveColorId } = useYearInPixelsStore();
    const { isLight } = useObsyTheme();

    if (legend.length === 0) {
        return (
            <View style={styles.container}>
                <ThemedText style={[styles.title, { color: isLight ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.3)' }]}>
                    PALETTE
                </ThemedText>
                <ThemedText style={[styles.hint, { color: isLight ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.25)' }]}>
                    Add colors in Year in Pixels
                </ThemedText>
            </View>
        );
    }

    const handleSelect = (id: string) => {
        setActiveColorId(activeColorId === id ? null : id);
    };

    return (
        <View style={[styles.container, maxHeight ? { maxHeight } : undefined]}>
            <ThemedText style={[styles.title, { color: isLight ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.3)' }]}>
                PALETTE
            </ThemedText>
            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.swatchList}
            >
                {legend.map((item) => {
                    const isActive = activeColorId === item.id;
                    return (
                        <View key={item.id} style={styles.swatchItem}>
                            <TouchableOpacity
                                onPress={() => handleSelect(item.id)}
                                style={[
                                    styles.swatch,
                                    { backgroundColor: item.color },
                                    isActive && styles.swatchActive,
                                ]}
                            />
                            <ThemedText
                                style={[styles.swatchLabel, { color: isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)' }]}
                                numberOfLines={1}
                            >
                                {item.label}
                            </ThemedText>
                        </View>
                    );
                })}
            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
    },
    title: {
        fontSize: 10,
        fontWeight: '600',
        letterSpacing: 1.5,
        textTransform: 'uppercase',
        marginBottom: 10,
    },
    hint: {
        fontSize: 10,
        textAlign: 'center',
        lineHeight: 14,
        marginTop: 8,
        paddingHorizontal: 4,
    },
    swatchList: {
        alignItems: 'center',
        gap: 10,
        paddingBottom: 8,
    },
    swatchItem: {
        alignItems: 'center',
        gap: 3,
    },
    swatch: {
        width: 28,
        height: 28,
        borderRadius: 8,
    },
    swatchActive: {
        borderWidth: 2.5,
        borderColor: GOLD,
        shadowColor: GOLD,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.4,
        shadowRadius: 4,
        elevation: 4,
    },
    swatchLabel: {
        fontSize: 8,
        maxWidth: 50,
        textAlign: 'center',
    },
});
