import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { ThemedText } from '@/components/ui/ThemedText';
import { useObsyTheme } from '@/contexts/ThemeContext';
import { getMoodTheme } from '@/lib/moods';

interface MoodTriggerRowProps {
    moodId: string | null;
    moodName: string;
    onPress: () => void;
    onClear: () => void;
}

/**
 * Compact mood trigger below the home composer. Empty state matches the
 * "+ How are you feeling?" pill from the voice screen; selected state shows
 * the mood's gradient chip.
 */
export function MoodTriggerRow({ moodId, moodName, onPress, onClear }: MoodTriggerRowProps) {
    const { colors, isLight } = useObsyTheme();

    const placeholderColor = isLight ? colors.cardTextSecondary : 'rgba(255,255,255,0.55)';
    const idleBg = isLight ? 'rgba(20,20,22,0.94)' : 'rgba(255,255,255,0.08)';
    const idleBorder = isLight ? colors.cardBorder : 'rgba(255,255,255,0.12)';

    if (!moodId) {
        return (
            <TouchableOpacity
                activeOpacity={0.75}
                onPress={onPress}
                style={[styles.trigger, { backgroundColor: idleBg, borderColor: idleBorder }]}
            >
                <Ionicons name="add" size={14} color={placeholderColor} />
                <ThemedText style={[styles.placeholder, { color: placeholderColor }]}>
                    How are you feeling?
                </ThemedText>
            </TouchableOpacity>
        );
    }

    const theme = getMoodTheme(moodId);
    const { primary, mid, secondary } = theme.gradient;
    const textColor = theme.textOn === 'light' ? '#FFFFFF' : 'rgba(10,10,12,0.9)';

    return (
        <View style={styles.selectedRow}>
            <TouchableOpacity activeOpacity={0.8} onPress={onPress}>
                <LinearGradient
                    colors={[primary, mid, secondary]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.moodChip}
                >
                    <ThemedText style={[styles.moodChipText, { color: textColor }]}>
                        {moodName}
                    </ThemedText>
                    <Ionicons name="chevron-down" size={13} color={textColor} />
                </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
                onPress={onClear}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={[styles.clearButton, { borderColor: idleBorder }]}
            >
                <Ionicons name="close" size={13} color={placeholderColor} />
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    trigger: {
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 100,
        borderWidth: 1,
    },
    placeholder: {
        fontSize: 14,
    },
    selectedRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    moodChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 100,
    },
    moodChipText: {
        fontSize: 14,
        fontWeight: '600',
    },
    clearButton: {
        width: 28,
        height: 28,
        borderRadius: 14,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
});
